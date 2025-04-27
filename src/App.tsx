import { AdvancedSearch, SearchParams } from "@/components/ui/advanced-search"
import { invoke } from "@tauri-apps/api/core"
import { useEffect, useMemo, useRef, useState } from "react"

type Conversation = {
	id: string
	name: string | null
	last_message: string | null
	last_message_date: number
}

type Message = {
	id: number
	text: string
	date: number
	is_from_me: boolean
	chat_id?: string
	sender_name?: string
	contact_name?: string
}

type SearchResult = {
	messages: Message[]
	total_count: number
}

// New types for contact mapping
type ContactInfo = {
	id: string
	name: string
	type: "contact" | "email" | "phone"
	value?: string
}

type ContactMap = {
	byId: Record<string, ContactInfo>
	byPhone: Record<string, ContactInfo>
	byEmail: Record<string, ContactInfo>
}

// New type to store messages by conversation ID
type MessagesByConversation = Record<string, Message[]>

function App() {
	const [conversations, setConversations] = useState<Conversation[]>([])
	const [selectedConversation, setSelectedConversation] = useState<
		string | null
	>(null)
	const [messages, setMessages] = useState<Message[]>([])
	const [messagesByConversation, setMessagesByConversation] =
		useState<MessagesByConversation>({})
	const [loading, setLoading] = useState<boolean>(true)
	const [contactsLoading, setContactsLoading] = useState<boolean>(true)
	const [error, setError] = useState<string | null>(null)
	const [searchQuery, setSearchQuery] = useState<string>("")
	const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
	const [isSearching, setIsSearching] = useState<boolean>(false)
	const [contactsData, setContactsData] = useState<string | null>(null)

	const [contactMap, setContactMap] = useState<ContactMap>({
		byId: {},
		byPhone: {},
		byEmail: {},
	})
	const [conversationTitles, setConversationTitles] = useState<
		Record<string, string>
	>({})

	// Add a ref for the messages container
	const messagesContainerRef = useRef<HTMLDivElement>(null)

	// Parse contacts data into a usable map when contactsData changes
	useEffect(() => {
		if (!contactsData) return

		const parseContactsData = () => {
			const lines = contactsData.split("\n")
			const summaryEndIndex = lines.findIndex((line) => line === "")
			const contactLines = lines
				.slice(summaryEndIndex + 1)
				.filter((line) => line.trim() !== "")

			const newContactMap: ContactMap = {
				byId: {},
				byPhone: {},
				byEmail: {},
			}

			contactLines.forEach((line) => {
				// Process contact entries
				if (line.includes("Contact [ID:")) {
					const idMatch = line.match(/Contact \[ID: (\d+)\]/)
					if (idMatch && idMatch[1]) {
						const id = idMatch[1]
						const name = line.replace(/Contact \[ID: \d+\]: /, "").trim()

						if (name && name !== "<No Name>") {
							newContactMap.byId[id] = {
								id,
								name,
								type: "contact",
							}
						}
					}
				}
				// Process email entries
				else if (line.includes("Email [ID:")) {
					const match = line.match(/Email \[ID: (\d+)\] (.*?): (.*)/)
					if (match && match[1] && match[3]) {
						const id = match[1]
						const name = match[2].trim()
						const email = match[3].trim()

						if (email) {
							const contactInfo = {
								id,
								name: name !== "<No Name>" ? name : email,
								type: "email" as const,
								value: email,
							}

							newContactMap.byId[id] = contactInfo
							newContactMap.byEmail[email] = contactInfo
						}
					}
				}
				// Process phone entries
				else if (line.includes("Phone [ID:")) {
					const match = line.match(/Phone \[ID: (\d+)\] (.*?): (.*)/)
					if (match && match[1] && match[3]) {
						const id = match[1]
						const name = match[2].trim()
						const phone = match[3].trim()

						if (phone) {
							const contactInfo = {
								id,
								name: name !== "<No Name>" ? name : phone,
								type: "phone" as const,
								value: phone,
							}

							newContactMap.byId[id] = contactInfo
							newContactMap.byPhone[phone] = contactInfo
						}
					}
				}
			})

			console.log("Parsed contact map:", newContactMap)
			setContactMap(newContactMap)
		}

		parseContactsData()
	}, [contactsData])

	// Function to match a sender ID with a contact name
	const getContactNameForSender = (
		senderId: string | undefined
	): string | undefined => {
		if (!senderId) return undefined

		// Try direct match first (this will catch emails and exact phone matches)
		if (contactMap.byPhone[senderId]) {
			return contactMap.byPhone[senderId].name
		}
		if (contactMap.byEmail[senderId]) {
			return contactMap.byEmail[senderId].name
		}

		// Try to match with email (case insensitive)
		if (senderId.includes("@")) {
			const lowerEmail = senderId.toLowerCase()
			if (contactMap.byEmail[lowerEmail]) {
				return contactMap.byEmail[lowerEmail].name
			}
		}

		// Try to match with phone number by checking all formats
		const phoneContacts = Object.entries(contactMap.byPhone)
		for (const [storedNumber, contact] of phoneContacts) {
			// Remove all non-digits from both numbers for comparison
			const normalizedStored = storedNumber.replace(/\D/g, "")
			const normalizedSender = senderId.replace(/\D/g, "")

			// Match if either the full numbers match or the last 10 digits match
			if (
				normalizedStored === normalizedSender ||
				(normalizedStored.length >= 10 &&
					normalizedSender.length >= 10 &&
					normalizedStored.slice(-10) === normalizedSender.slice(-10))
			) {
				return contact.name
			}
		}

		return undefined
	}

	// Apply contact names to a specific set of messages
	const applyContactNamesToMessages = (
		messagesToProcess: Message[]
	): Message[] => {
		return messagesToProcess.map((message) => {
			if (!message.is_from_me && message.sender_name) {
				const contactName = getContactNameForSender(message.sender_name)
				if (contactName) {
					return { ...message, contact_name: contactName }
				}
			}
			return message
		})
	}

	// Apply contact names to messages
	const messagesWithContactNames = useMemo(() => {
		return applyContactNamesToMessages(messages)
	}, [messages, contactMap])

	// Apply contact names to search results
	const searchResultsWithContactNames = useMemo(() => {
		if (!searchResults) return null

		const updatedMessages = applyContactNamesToMessages(searchResults.messages)

		return {
			...searchResults,
			messages: updatedMessages,
		}
	}, [searchResults, contactMap])

	// Scroll to bottom of messages when they change or when loading completes
	useEffect(() => {
		if (!loading && messagesContainerRef.current && selectedConversation) {
			// Use setTimeout to ensure this runs after the DOM updates
			setTimeout(() => {
				if (messagesContainerRef.current) {
					messagesContainerRef.current.scrollTop =
						messagesContainerRef.current.scrollHeight
				}
			}, 100)
		}
	}, [loading, messages, selectedConversation])

	// Add a function to generate conversation titles
	const generateConversationTitle = (
		conversation: Conversation,
		messagesForConversation: Message[] = []
	): string => {
		// If conversation already has a name, use it
		if (conversation.name) {
			const contactName = getContactNameForSender(conversation.name)
			if (contactName) {
				return contactName
			}
			return conversation.name
		}

		// Get unique participants from messages
		const participants = new Set<string>()
		messagesForConversation.forEach((message) => {
			if (!message.is_from_me && message.sender_name) {
				const contactName = getContactNameForSender(message.sender_name)
				participants.add(contactName || message.sender_name)
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
						const messagesWithNames = applyContactNamesToMessages(messagesArray)
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

	// Initial load of conversations and contacts
	useEffect(() => {
		// On component mount, try to load conversations and contacts
		const loadConversations = async () => {
			try {
				setLoading(true)
				setError(null)
				// This will be implemented in Rust to safely access the SQLite DB
				const fetchedConversations = await invoke("get_conversations")
				console.log("Fetched conversations:", fetchedConversations)
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
				await preloadConversationMessages(
					fetchedConversations as Conversation[]
				)
			} catch (error) {
				console.error("Failed to load conversations:", error)
				setError(
					"Failed to load conversations. You may need to grant access to the Messages database."
				)
			} finally {
				setLoading(false)
			}
		}

		// Load contacts automatically when the app starts
		const loadContacts = async () => {
			try {
				setContactsLoading(true)
				const contacts = await invoke("read_contacts")
				console.log("Fetched contacts:", contacts)
				setContactsData(contacts as string)
			} catch (error) {
				console.error("Failed to load contacts:", error)
				setContactsData("Error loading contacts: " + String(error))
			} finally {
				setContactsLoading(false)
			}
		}

		// Load both conversations and contacts
		Promise.all([loadConversations(), loadContacts()])

		// Debug: Log if styles are applied
		console.log(
			"Style test - bg-blue-500:",
			getComputedStyle(document.querySelector(".bg-blue-500") || document.body)
				.backgroundColor
		)
	}, [])

	// Combine loading states for overall app loading state
	const isAppLoading = loading || contactsLoading

	const handleSelectConversation = async (conversationId: string) => {
		setSelectedConversation(conversationId)
		setLoading(true)
		setSearchResults(null)
		setSearchQuery("")

		try {
			// Check if we already have messages for this conversation
			if (messagesByConversation[conversationId]) {
				setMessages(messagesByConversation[conversationId])
			} else {
				// Fetch messages from the backend
				const fetchedMessages = await invoke("get_messages", { conversationId })
				console.log("Fetched messages:", fetchedMessages)

				// Store and set the messages
				const messagesArray = fetchedMessages as Message[]
				setMessages(messagesArray)

				// Update the messages by conversation map
				setMessagesByConversation((prev) => ({
					...prev,
					[conversationId]: messagesArray,
				}))

				// Process the messages to generate a better title if needed
				const conversation = conversations.find((c) => c.id === conversationId)
				if (conversation) {
					const messagesWithNames = applyContactNamesToMessages(messagesArray)
					const title = generateConversationTitle(
						conversation,
						messagesWithNames
					)

					// Only update if we have a better title than the default
					if (title !== "Conversation" || !conversation.name) {
						setConversationTitles((prev) => ({
							...prev,
							[conversationId]: title,
						}))
					}
				}
			}
		} catch (error) {
			console.error("Failed to load messages:", error)
		} finally {
			setLoading(false)
		}
	}

	const handleSearch = async (params: SearchParams) => {
		console.log("handleSearch", params)

		setIsSearching(true)

		try {
			// Initialize query parts array to build the search query
			const queryParts: string[] = []

			// Add text search if provided
			if (params.query.trim()) {
				queryParts.push(params.query.trim())
			}

			// Add date filters if provided
			if (params.startDate) {
				const startTimestamp = Math.floor(params.startDate.getTime() / 1000)
				queryParts.push(`AFTER:${startTimestamp}`)
			}
			if (params.endDate) {
				const endTimestamp = Math.floor(params.endDate.getTime() / 1000)
				queryParts.push(`BEFORE:${endTimestamp}`)
			}

			// Add contact filter if provided
			if (params.selectedContact) {
				const contact = params.selectedContact
				const searchValues: string[] = []

				// Always include the contact's name
				searchValues.push(contact.name)

				// Find all associated contacts with the same name
				const relatedContacts = Object.values(contactMap.byId).filter(
					(c) => c.name === contact.name
				)

				// Collect all unique identifiers with original format
				relatedContacts.forEach((relatedContact) => {
					if (relatedContact.value) {
						searchValues.push(relatedContact.value)
					}
				})

				// Remove duplicates and create OR conditions for each value
				const uniqueSearchValues = [...new Set(searchValues)]
				// Create FROM conditions, properly escaping quotes in values
				const fromConditions = uniqueSearchValues.map((value) => {
					// Escape any quotes in the value and wrap in quotes
					const escapedValue = value.replace(/"/g, '\\"')
					return `FROM:"${escapedValue}"`
				})
				queryParts.push(`(${fromConditions.join(" OR ")})`)
			}

			// Add conversation filter if provided
			if (params.selectedConversation) {
				const conversationId = params.selectedConversation.id
				// Escape any quotes in the conversation ID and wrap in quotes
				const escapedId = conversationId.replace(/"/g, '\\"')
				queryParts.push(`CONVERSATION:"${escapedId}"`)
			}

			// If no search parameters are provided, return early with an empty result
			if (queryParts.length === 0) {
				setSearchResults({ messages: [], total_count: 0 })
				setSelectedConversation(null)
				setIsSearching(false)
				return
			}

			// Join all query parts with spaces
			const query = queryParts.join(" ")

			console.log("Advanced search query:", query)
			const results = await invoke("search_messages", { query })
			console.log("Search results:", results)
			setSearchResults(results as SearchResult)
			setSelectedConversation(null)
		} catch (error) {
			console.error("Search failed:", error)
		} finally {
			setIsSearching(false)
		}
	}

	// Function to jump to a conversation from search results
	const jumpToConversation = (chatId: string) => {
		handleSelectConversation(chatId)
	}

	return (
		<div className='flex flex-col h-screen bg-gray-100'>
			{isAppLoading ? (
				<div className='flex justify-center items-center h-full'>
					<div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500'></div>
				</div>
			) : (
				<>
					{/* Search Bar with Contacts Toggle Button */}
					<div className='p-4 bg-white border-b border-gray-200'>
						<div className='flex flex-col space-y-2'>
							<AdvancedSearch
								onSearch={handleSearch}
								contactMap={contactMap}
								conversations={conversations.map((conv) => ({
									id: conv.id,
									name:
										conversationTitles[conv.id] || conv.name || "Conversation",
									participants:
										messagesByConversation[conv.id]
											?.filter(
												(msg) =>
													!msg.is_from_me &&
													(msg.contact_name || msg.sender_name)
											)
											?.map((msg) => ({
												id: msg.sender_name || msg.contact_name || "",
												name: msg.contact_name || msg.sender_name || "",
												type: "contact" as const,
											}))
											?.filter(
												(participant, index, self) =>
													index ===
													self.findIndex((p) => p.id === participant.id)
											) || [],
								}))}
							/>
						</div>
					</div>

					<div className='flex flex-1 overflow-hidden'>
						{/* Sidebar */}
						<div className='w-1/4 bg-white border-r border-gray-200 overflow-y-auto'>
							<div className='p-4 border-b border-gray-200'>
								<h1 className='text-2xl font-bold text-gray-800'>
									Conversations
								</h1>
							</div>

							<div className='overflow-y-auto h-full'>
								{loading && !conversations.length ? (
									<div className='flex justify-center items-center h-full'>
										<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500'></div>
									</div>
								) : error ? (
									<div className='p-4 text-center text-red-500'>{error}</div>
								) : (
									<ul>
										{conversations.length ? (
											conversations.map((conversation) => (
												<li
													key={conversation.id}
													className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
														selectedConversation === conversation.id
															? "bg-blue-50"
															: ""
													}`}
													onClick={() =>
														handleSelectConversation(conversation.id)
													}
													tabIndex={0}
													aria-label={`Conversation with ${
														conversation.name || "Unknown"
													}`}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") {
															handleSelectConversation(conversation.id)
														}
													}}
												>
													<div className='font-medium text-gray-800'>
														{conversationTitles[conversation.id] ||
															conversation.name ||
															"Conversation"}
													</div>
													<div className='text-sm text-gray-500 truncate'>
														{conversation.last_message || "No messages"}
													</div>
													<div className='text-xs text-gray-400'>
														{conversation.last_message_date
															? new Date(
																	conversation.last_message_date * 1000
															  ).toLocaleDateString()
															: ""}
													</div>
												</li>
											))
										) : (
											<div className='p-4 text-center text-gray-500'>
												No conversations found
											</div>
										)}
									</ul>
								)}
							</div>
						</div>

						{/* Main Content */}
						<div className='flex-1 flex flex-col overflow-hidden'>
							{/* Top Bar */}
							<div className='p-4 border-b border-gray-200 bg-white'>
								<h2 className='text-xl font-semibold text-gray-800'>
									{selectedConversation
										? (() => {
												const conversation = conversations.find(
													(c) => c.id === selectedConversation
												)
												if (!conversation) return "Conversation"
												return (
													conversationTitles[selectedConversation] ||
													conversation.name ||
													"Conversation"
												)
										  })()
										: searchResults
										? `Search Results (${searchResults.total_count})`
										: "Select a conversation"}
								</h2>
							</div>

							{/* Messages Area - add ref here */}
							<div
								ref={messagesContainerRef}
								className='flex-1 overflow-y-auto p-4 bg-gray-50'
							>
								{loading ? (
									<div className='flex justify-center items-center h-full'>
										<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500'></div>
									</div>
								) : searchResultsWithContactNames ? (
									// Search Results
									<div className='space-y-4'>
										{searchResultsWithContactNames.messages.length > 0 ? (
											searchResultsWithContactNames.messages.map((message) => (
												<div
													key={message.id}
													className='border border-gray-200 rounded-lg p-4 bg-white'
												>
													<div
														className={`max-w-full rounded-lg px-4 py-2 ${
															message.is_from_me
																? "bg-blue-100 text-blue-800"
																: "bg-gray-100 text-gray-800"
														}`}
													>
														{!message.is_from_me &&
															(message.contact_name || message.sender_name) && (
																<div className='text-xs font-medium text-gray-600 mb-1'>
																	{message.contact_name || message.sender_name}
																</div>
															)}
														<div className='text-sm'>{message.text}</div>
														<div className='text-xs mt-1 text-gray-500'>
															{new Date(message.date * 1000).toLocaleString()}
														</div>
													</div>
													{message.chat_id && (
														<button
															onClick={() =>
																jumpToConversation(message.chat_id!)
															}
															className='mt-2 text-sm text-blue-600 hover:underline'
														>
															Go to conversation
														</button>
													)}
												</div>
											))
										) : (
											<div className='flex justify-center items-center h-full'>
												<p className='text-gray-500'>
													No messages found containing "{searchQuery}"
												</p>
											</div>
										)}
									</div>
								) : selectedConversation ? (
									// Regular conversation view
									messagesWithContactNames.length ? (
										<div className='space-y-4'>
											{messagesWithContactNames.map((message) => (
												<div
													key={message.id}
													className={`flex ${
														message.is_from_me ? "justify-end" : "justify-start"
													}`}
												>
													<div
														className={`max-w-xs md:max-w-md rounded-lg px-4 py-2 ${
															message.is_from_me
																? "bg-blue-500 text-white rounded-br-none"
																: "bg-gray-200 text-gray-800 rounded-bl-none"
														}`}
													>
														{!message.is_from_me &&
															(message.contact_name || message.sender_name) && (
																<div className='text-xs font-medium text-gray-600 mb-1'>
																	{message.contact_name || message.sender_name}
																</div>
															)}
														<div className='text-sm'>{message.text}</div>
														<div className='text-xs text-right mt-1 opacity-70'>
															{new Date(message.date * 1000).toLocaleTimeString(
																[],
																{
																	hour: "2-digit",
																	minute: "2-digit",
																}
															)}
														</div>
													</div>
												</div>
											))}
										</div>
									) : (
										<div className='flex justify-center items-center h-full'>
											<p className='text-gray-500'>
												No messages in this conversation
											</p>
										</div>
									)
								) : (
									<div className='flex justify-center items-center h-full'>
										<p className='text-gray-500'>
											Search for messages or select a conversation
										</p>
									</div>
								)}
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	)
}

export default App
