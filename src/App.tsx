import { AdvancedSearch, SearchParams } from "@/components/AdvancedSearch"
import Loader from "@/components/Loader"
import { MessagesView } from "@/components/MessagesView"
import { Badge } from "@/components/ui/badge"
import { Contact, Conversation, Message, SearchResult } from "@/types"
import { invoke } from "@tauri-apps/api/core"
import { format } from "date-fns"
import { useCallback, useEffect, useMemo, useState } from "react"

// Utility function to strip non-numeric characters
const stripNonNumeric = (str: string): string => str.replace(/\D/g, "")

function App() {
	const [conversations, setConversations] = useState<Conversation[]>([])
	const [messagesByConversation, setMessagesByConversation] = useState<
		Record<string, Message[]>
	>({})
	const [loading, setLoading] = useState<boolean>(true)
	const [contactsLoading, setContactsLoading] = useState<boolean>(true)
	const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
	const [contacts, setContacts] = useState<Contact[] | null>(null)
	const [conversationTitles, setConversationTitles] = useState<
		Record<string, string>
	>({})
	const [searchParams, setSearchParams] = useState<SearchParams | null>(null)

	// Parse contacts data into a usable map when contactsData changes

	// Function to find a contact for a sender ID
	const getContactForSender = (
		senderId: string | undefined
	): Contact | undefined => {
		if (!senderId || !contacts) return undefined

		// For email addresses
		if (senderId.includes("@")) {
			const lowerEmail = senderId.toLowerCase()
			return contacts.find((c) => c.emails.includes(lowerEmail))
		}

		// For phone numbers, strip non-numeric characters and try to match
		const strippedNumber = stripNonNumeric(senderId)
		if (strippedNumber) {
			// Direct match with stripped number
			const directMatch = contacts.find((c) =>
				c.phones.includes(strippedNumber)
			)
			if (directMatch) return directMatch

			// Try matching last 10 digits if the number is longer
			if (strippedNumber.length >= 10) {
				const last10 = strippedNumber.slice(-10)
				return contacts.find((c) =>
					c.phones.some((phone) => phone.endsWith(last10))
				)
			}
		}

		return undefined
	}

	// Apply contacts to a specific set of messages
	const applyContactsToMessages = (messagesToProcess: Message[]): Message[] => {
		return messagesToProcess.map((message) => {
			if (!message.is_from_me && message.sender_name) {
				const contact = getContactForSender(message.sender_name)
				if (contact) {
					return { ...message, contact }
				}
			}
			return message
		})
	}

	// Apply contacts to search results
	const searchResultsWithContacts = useMemo(() => {
		if (!searchResults) return null

		let updatedMessages = applyContactsToMessages(searchResults.messages)
		return {
			messages: updatedMessages,
		}
	}, [searchResults, contacts])

	const generateConversationTitle = (
		conversation: Conversation,
		messagesForConversation: Message[] = []
	): string => {
		if (conversation.name) {
			const contact = getContactForSender(conversation.name)
			if (contact) {
				return contact.first_name
			}
			return conversation.name
		}

		// Get unique participants from messages
		const participants = new Set<string>()
		messagesForConversation.forEach((message) => {
			if (!message.is_from_me && message.sender_name) {
				const contact = getContactForSender(message.sender_name)
				participants.add(contact ? contact.first_name : message.sender_name)
			}
		})

		const participantList = Array.from(participants)

		if (participantList.length === 0) {
			return "Conversation"
		}

		if (participantList.length === 1) {
			return participantList[0]
		}

		if (participantList.length === 2) {
			return `${participantList[0]} and ${participantList[1]}`
		}

		return `${participantList[0]} and ${participantList.length - 1} others`
	}

	// Helper function to preload messages for each conversation
	const preloadConversationMessages = async (conversations: Conversation[]) => {
		// Process conversations in small batches to avoid overwhelming the system
		const batchSize = 5
		const batches = Math.ceil(conversations.length / batchSize)

		for (let i = 0; i < batches; i++) {
			const batchStart = i * batchSize
			const batchEnd = Math.min(batchStart + batchSize, conversations.length)
			const batch = conversations.slice(batchStart, batchEnd)

			// Process each conversation in parallel within the batch
			await Promise.all(
				batch.map(async (conversation) => {
					try {
						// Fetch just enough messages to determine participants
						const fetchedMessages = await invoke("get_messages", {
							conversationId: conversation.id,
						})
						const messagesArray = fetchedMessages as Message[]

						// Update the messages by conversation map
						setMessagesByConversation((prev) => ({
							...prev,
							[conversation.id]: messagesArray,
						}))

						// Process messages to get proper names
						const messagesWithNames = applyContactsToMessages(messagesArray)
						const title = generateConversationTitle(
							conversation,
							messagesWithNames
						)

						// Update the title if we got something meaningful
						if (title !== "Conversation") {
							setConversationTitles((prev) => ({
								...prev,
								[conversation.id]: title,
							}))
						}
					} catch (error) {
						console.error(
							`Failed to preload messages for conversation ${conversation.id}:`,
							error
						)
					}
				})
			)

			// Small delay between batches to let the UI breathe
			if (i < batches - 1) {
				await new Promise((resolve) => setTimeout(resolve, 100))
			}
		}
	}

	// Function to load conversations
	const loadConversations = async () => {
		try {
			setLoading(true)
			// This will be implemented in Rust to safely access the SQLite DB
			const fetchedConversations = await invoke("get_conversations")
			setConversations(fetchedConversations as Conversation[])

			// Initialize the conversation titles with what we have
			const initialTitles: Record<string, string> = {}
			for (const conv of fetchedConversations as Conversation[]) {
				// Use the conversation name if available, or try to extract names from participants
				if (conv.name) {
					initialTitles[conv.id] = conv.name
				} else if (conv.last_message) {
					// Try to extract a name from the last sender
					initialTitles[conv.id] = "Chat" // Will be updated shortly
				} else {
					initialTitles[conv.id] = "Chat" // Will be updated shortly
				}
			}
			setConversationTitles(initialTitles)

			// Preload messages for each conversation
			await preloadConversationMessages(fetchedConversations as Conversation[])
		} catch (error) {
			console.error("Failed to load conversations:", error)
		} finally {
			setLoading(false)
		}
	}

	// Function to load contacts
	const loadContacts = async () => {
		try {
			setContactsLoading(true)
			const contacts = await invoke("read_contacts")
			// @ts-ignore
			const contactsJSON = contacts.contacts as Contact[]
			setContacts(contactsJSON)
		} catch (error) {
			console.error("Failed to load contacts:", error)
		} finally {
			setContactsLoading(false)
		}
	}

	// Function to refresh all data
	const refreshData = useCallback(async () => {
		await Promise.all([loadConversations(), loadContacts()])
	}, [])

	// Handle keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Check for Command+R (Mac) or Control+R (Windows/Linux)
			if ((event.metaKey || event.ctrlKey) && event.key === "r") {
				event.preventDefault() // Prevent the browser's default refresh
				refreshData()
			}
		}

		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [refreshData])

	// Initial load of conversations and contacts
	useEffect(() => {
		refreshData()
	}, [refreshData])

	const searchMessages = useCallback(
		async (query: string) => {
			try {
				const results = await invoke("search_messages", {
					query,
					showOnlyMyMessages: searchParams?.showOnlyMyMessages,
					showOnlyAttachments: searchParams?.showOnlyAttachments,
				})
				console.log("Search results:", results)
				setSearchResults(results as SearchResult)
			} catch (error) {
				console.error("Search failed:", error)
			}
		},
		[searchParams?.showOnlyMyMessages, searchParams?.showOnlyAttachments]
	)

	const handleSearch = useCallback(
		async (params: SearchParams) => {
			// Store the search params for filtering
			setSearchParams(params)

			let query = params.query

			// Add FROM: filters for selected contacts
			if (params.selectedContacts.length > 0) {
				const fromQueries = params.selectedContacts.map((contact) => {
					// Get all contacts with the same name
					const relatedContacts =
						contacts?.filter((c) => c.first_name === contact.first_name) || []
					// Create FROM: queries for each contact value
					return relatedContacts.map((c) => `FROM:${c.phones[0]}`).join(" OR ")
				})
				// Join all contact queries with OR and wrap in parentheses
				query = `${query} (${fromQueries.map((q) => `(${q})`).join(" OR ")})`
			}

			// Add date range filters
			if (params.startDate) {
				query += ` AFTER:${format(params.startDate, "yyyy-MM-dd")}`
			}
			if (params.endDate) {
				query += ` BEFORE:${format(params.endDate, "yyyy-MM-dd")}`
			}

			// Add conversation filter
			if (params.selectedConversation) {
				query += ` CONVERSATION:${params.selectedConversation.id}`
			}

			await searchMessages(query.trim())
		},
		[contacts, searchMessages]
	)

	// Effect to perform initial search and handle filter changes
	useEffect(() => {
		// If we have searchParams, use those, otherwise do a default empty search
		if (searchParams) {
			handleSearch(searchParams)
		} else {
			// Initial empty search with default params
			handleSearch({
				query: "",
				selectedContacts: [],
				startDate: undefined,
				endDate: undefined,
				selectedConversation: null,
				showOnlyMyMessages: false,
				showOnlyAttachments: false,
			})
		}
	}, [
		handleSearch,
		searchParams?.showOnlyMyMessages,
		searchParams?.showOnlyAttachments,
	])

	// Combine loading states for overall app loading state
	const isAppLoading = loading || contactsLoading

	return (
		<div className='flex h-screen w-screen'>
			{isAppLoading ? (
				<Loader />
			) : (
				<>
					<AdvancedSearch
						onSearch={handleSearch}
						contacts={contacts || []}
						conversations={conversations.map((conv) => ({
							id: conv.id,
							name: conversationTitles[conv.id] || conv.name || "Conversation",
							participants:
								messagesByConversation[conv.id]
									?.filter((msg) => !msg.is_from_me && msg.sender_name)
									?.map((msg) => ({
										id: msg.sender_name || "",
										name: msg.contact?.first_name || msg.sender_name || "",
										type: "contact" as const,
									}))
									?.filter(
										(participant, index, self) =>
											index === self.findIndex((p) => p.id === participant.id)
									) || [],
						}))}
					/>

					<div className='flex flex-1 flex-col'>
						<div className='p-4 border-b border-border flex items-center justify-between'>
							<h2 className='text-lg font-medium'>Search Results</h2>
							<Badge variant='outline'>
								{searchResults?.messages.length || 0} messages
							</Badge>
						</div>
						<MessagesView
							loading={loading}
							messages={searchResultsWithContacts?.messages || []}
						/>
					</div>
				</>
			)}
		</div>
	)
}

export default App
