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
	const [error, setError] = useState<string | null>(null)
	const [searchQuery, setSearchQuery] = useState<string>("")
	const [searchParams, setSearchParams] = useState<SearchParams>({
		query: "",
		startDate: undefined,
		endDate: undefined,
		selectedContact: null,
	})
	const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
	const [isSearching, setIsSearching] = useState<boolean>(false)
	const [contactsData, setContactsData] = useState<string | null>(null)
	const [isLoadingContacts, setIsLoadingContacts] = useState<boolean>(false)
	const [showContacts, setShowContacts] = useState<boolean>(false)
	const [contactMap, setContactMap] = useState<ContactMap>({
		byId: {},
		byPhone: {},
		byEmail: {},
	})
	const [contactSearchQuery, setContactSearchQuery] = useState<string>("")
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
						const email = match[3].trim().toLowerCase()

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

						// Normalize phone number - remove spaces, dashes, etc
						const normalizedPhone = phone.replace(/\D/g, "")

						if (normalizedPhone) {
							const contactInfo = {
								id,
								name: name !== "<No Name>" ? name : phone,
								type: "phone" as const,
								value: normalizedPhone,
							}

							newContactMap.byId[id] = contactInfo
							newContactMap.byPhone[normalizedPhone] = contactInfo

							// Also store short version of phone (last 10 digits) for matching
							if (normalizedPhone.length >= 10) {
								const shortPhone = normalizedPhone.slice(-10)
								newContactMap.byPhone[shortPhone] = contactInfo
							}
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

		// Try to match with phone number
		const normalizedSender = senderId.replace(/\D/g, "")
		if (normalizedSender && contactMap.byPhone[normalizedSender]) {
			return contactMap.byPhone[normalizedSender].name
		}

		// If it's a long phone number, try matching last 10 digits
		if (normalizedSender.length > 10) {
			const shortPhone = normalizedSender.slice(-10)
			if (contactMap.byPhone[shortPhone]) {
				return contactMap.byPhone[shortPhone].name
			}
		}

		// Try to match with email
		if (senderId.includes("@")) {
			const lowerEmail = senderId.toLowerCase()
			if (contactMap.byEmail[lowerEmail]) {
				return contactMap.byEmail[lowerEmail].name
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
			return conversation.name
		}

		// Get unique participants from messages
		const participants = new Set<string>()

		messagesForConversation.forEach((message) => {
			if (
				!message.is_from_me &&
				(message.contact_name || message.sender_name)
			) {
				participants.add(message.contact_name || message.sender_name!)
			}
		})

		// Convert to array and sort
		const participantNames = Array.from(participants).sort()

		// No participants found
		if (participantNames.length === 0) {
			return "Conversation"
		}

		// Single participant
		if (participantNames.length === 1) {
			return participantNames[0]
		}

		// 2 participants
		if (participantNames.length === 2) {
			return `${participantNames[0]} & ${participantNames[1]}`
		}

		// 3 or more participants (Apple style: "A, B, & C")
		const lastParticipant = participantNames.pop()!
		return `${participantNames.join(", ")}, & ${lastParticipant}`
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
				setIsLoadingContacts(true)
				const contacts = await invoke("read_contacts")
				console.log("Fetched contacts:", contacts)
				setContactsData(contacts as string)
			} catch (error) {
				console.error("Failed to load contacts:", error)
				setContactsData("Error loading contacts: " + String(error))
			} finally {
				setIsLoadingContacts(false)
			}
		}

		// Load both conversations and contacts
		loadConversations()
		loadContacts()

		// Debug: Log if styles are applied
		console.log(
			"Style test - bg-blue-500:",
			getComputedStyle(document.querySelector(".bg-blue-500") || document.body)
				.backgroundColor
		)
	}, [])

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
		if (!params.query.trim()) return

		setIsSearching(true)
		setSearchParams(params)

		try {
			// Build a more advanced search query with additional filters
			let query = params.query

			// Add date filters if provided
			if (params.startDate || params.endDate) {
				// Date filters will be handled on the Rust side
				// Using a placeholder format that will be parsed
				if (params.startDate) {
					const startTimestamp = Math.floor(params.startDate.getTime() / 1000)
					query += ` AFTER:${startTimestamp}`
				}
				if (params.endDate) {
					const endTimestamp = Math.floor(params.endDate.getTime() / 1000)
					query += ` BEFORE:${endTimestamp}`
				}
			}

			// Add contact filter if provided
			if (params.selectedContact) {
				if (
					params.selectedContact.type === "phone" &&
					params.selectedContact.value
				) {
					query += ` FROM:${params.selectedContact.value}`
				} else if (
					params.selectedContact.type === "email" &&
					params.selectedContact.value
				) {
					query += ` FROM:${params.selectedContact.value}`
				} else {
					query += ` FROM:${params.selectedContact.name}`
				}
			}

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

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleSearch(searchParams)
		}
	}

	// Function to jump to a conversation from search results
	const jumpToConversation = (chatId: string) => {
		handleSelectConversation(chatId)
	}

	// Function to load contacts from AddressBook
	const handleRefreshContacts = async () => {
		setIsLoadingContacts(true)
		setContactsData(null)
		try {
			const contacts = await invoke("read_contacts")
			console.log("Fetched contacts:", contacts)
			setContactsData(contacts as string)
		} catch (error) {
			console.error("Failed to load contacts:", error)
			setContactsData("Error loading contacts: " + String(error))
		} finally {
			setIsLoadingContacts(false)
		}
	}

	// Toggle contacts visibility
	const handleToggleContacts = () => {
		setShowContacts((prev) => !prev)
		// Clear search query when hiding contacts
		if (showContacts) {
			setContactSearchQuery("")
		}
	}

	// Parse contacts data for better display
	const renderContactsData = () => {
		if (!contactsData || !showContacts) return null

		// Split the data into lines
		const lines = contactsData.split("\n")

		// Extract the summary section
		const summaryEndIndex = lines.findIndex((line) => line === "")
		const summaryLines = lines
			.slice(0, summaryEndIndex)
			.filter((line) => line.trim() !== "")
		const contactLines = lines
			.slice(summaryEndIndex + 1)
			.filter((line) => line.trim() !== "")

		// Filter contacts based on search query
		const filteredContactLines = contactSearchQuery.trim()
			? contactLines.filter((line) =>
					line.toLowerCase().includes(contactSearchQuery.toLowerCase())
			  )
			: contactLines

		return (
			<div className='p-4 bg-white border-b border-gray-200'>
				<div className='flex justify-between items-center mb-3'>
					<h3 className='text-lg font-semibold'>Contacts Data</h3>
					<div className='flex space-x-2'>
						<button
							className='bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 focus:outline-none text-sm'
							onClick={handleRefreshContacts}
							disabled={isLoadingContacts}
						>
							{isLoadingContacts ? "Refreshing..." : "Refresh"}
						</button>
						<button
							className='bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600 focus:outline-none text-sm'
							onClick={handleToggleContacts}
						>
							Hide Contacts
						</button>
					</div>
				</div>

				{/* Contact search input */}
				<div className='mb-3'>
					<input
						type='text'
						placeholder='Search contacts...'
						className='w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm'
						value={contactSearchQuery}
						onChange={(e) => setContactSearchQuery(e.target.value)}
					/>
				</div>

				{/* Summary section */}
				<div className='bg-gray-100 p-3 rounded-lg mb-3 text-sm'>
					{summaryLines.map((line, index) => (
						<div key={`summary-${index}`} className='font-medium'>
							{line}
						</div>
					))}
				</div>

				{/* Contacts list - now in a scrollable container with max height */}
				<div className='max-h-96 overflow-y-auto pr-1'>
					<div className='space-y-2'>
						{filteredContactLines.length > 0 ? (
							filteredContactLines.map((line, index) => {
								// Parse contact data
								let isContact = line.includes("Contact [ID:")
								let isEmail = line.includes("Email [ID:")
								let isPhone = line.includes("Phone [ID:")

								let bgColor = isContact
									? "bg-blue-50 border-blue-200"
									: isEmail
									? "bg-green-50 border-green-200"
									: isPhone
									? "bg-amber-50 border-amber-200"
									: "bg-gray-50 border-gray-200"

								return (
									<div
										key={`contact-${index}`}
										className={`p-2 rounded ${bgColor} border text-sm hover:shadow-sm transition-shadow`}
									>
										{line}
									</div>
								)
							})
						) : (
							<div className='text-center py-4 text-gray-500'>
								No contacts matching "{contactSearchQuery}"
							</div>
						)}
					</div>
				</div>

				{/* Contact count */}
				<div className='mt-2 text-xs text-gray-500 text-right'>
					Showing {filteredContactLines.length} of {contactLines.length}{" "}
					contacts
				</div>
			</div>
		)
	}

	return (
		<div className='flex flex-col h-screen bg-gray-100'>
			{/* Search Bar with Contacts Toggle Button */}
			<div className='p-4 bg-white border-b border-gray-200'>
				<div className='flex flex-col space-y-2'>
					<AdvancedSearch
						onSearch={handleSearch}
						isSearching={isSearching}
						contactMap={contactMap}
					/>
				</div>
			</div>

			{/* Contacts Data Display */}
			{renderContactsData()}

			<div className='flex flex-1 overflow-hidden'>
				{/* Sidebar */}
				<div className='w-1/4 bg-white border-r border-gray-200 overflow-y-auto'>
					<div className='p-4 border-b border-gray-200'>
						<h1 className='text-2xl font-bold text-gray-800'>Conversations</h1>
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
											onClick={() => handleSelectConversation(conversation.id)}
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
													onClick={() => jumpToConversation(message.chat_id!)}
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
		</div>
	)
}

export default App
