import Loader from "@/components/Loader"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Contact, Message } from "@/types"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { homeDir } from "@tauri-apps/api/path"
import { openUrl } from "@tauri-apps/plugin-opener"
import { MessageCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "./ui/button"

type MessagesViewProps = {
	loading: boolean
	messages: Message[]
	conversations: {
		id: string
		name: string
		participants: {
			id: string
			name: string
			type: "contact"
		}[]
	}[]
}

// Helper function to format contact names consistently
const formatContactName = (
	contact: Contact | undefined | null
): {
	displayName: string
	initials: string
	identifier: string | undefined
} => {
	// If no contact, return default values
	if (!contact) {
		return {
			displayName: "Unknown",
			initials: "?",
			identifier: "Unknown",
		}
	}

	// Get first name and last name if they exist and aren't empty strings
	const firstName = contact.first_name?.trim() || ""
	const lastName = contact.last_name?.trim() || ""

	// If we have a real contact name, use it
	if (firstName || lastName) {
		return {
			displayName: [firstName, lastName].filter(Boolean).join(" "),
			initials: [
				firstName.charAt(0)?.toUpperCase() || "",
				lastName.charAt(0)?.toUpperCase() || "",
			]
				.filter(Boolean)
				.join(""),
			identifier: contact.phones[0] || contact.emails[0] || "Unknown",
		}
	}

	// If no real name, use the first email or phone as identifier
	const identifier = contact.phones[0] || contact.emails[0] || "Unknown"
	return {
		displayName: identifier,
		initials: identifier.charAt(0)?.toUpperCase() || "?",
		identifier: undefined,
	}
}

export function MessagesView({
	loading,
	messages,
	conversations,
}: MessagesViewProps) {
	const [homePath, setHomePath] = useState<string>("")
	const hasSearched = messages !== null

	useEffect(() => {
		// Get the home directory path when component mounts
		homeDir().then(setHomePath).catch(console.error)
	}, [])

	const openInMessages = async (chatId: string) => {
		try {
			openUrl(`messages://`)
			await invoke("open_imessage_conversation", { chatId })
		} catch (error) {
			console.error("Failed to open conversation:", error)
			toast.error("Failed to open conversation in Messages")
		}
	}

	// Add a function to get conversation name
	const getConversationName = (chatId: string | undefined) => {
		if (!chatId) return "Unknown Conversation"
		const conversation = conversations.find((conv) => conv.id === chatId)
		if (!conversation) return "Unknown Conversation"

		// If there's only one participant, it's a one-on-one DM
		if (conversation.participants.length <= 1) {
			return `in your conversation with ${conversation.name}`
		}

		// For group chats, just show the conversation name
		return `in ${conversation.name}`
	}

	if (loading) {
		return <Loader />
	}

	if (!hasSearched) {
		return (
			<div className='flex items-center justify-center h-[calc(100vh-10rem)] text-muted-foreground'>
				Enter a search query to find messages
			</div>
		)
	}

	if (messages.length === 0) {
		return (
			<div className='flex items-center justify-center h-[calc(100vh-10rem)] text-muted-foreground'>
				No messages match your search criteria
			</div>
		)
	}

	const getAssetUrl = (filePath: string) => {
		// expand ~
		const abs = filePath.startsWith("~")
			? filePath.replace("~", homePath)
			: filePath

		// tauri-safe url (asset:// or 127.0.0.1 blob behind the scenes)
		return convertFileSrc(abs)
	}

	return (
		<div className='flex-1 flex flex-col overflow-y-auto'>
			<ScrollArea className='flex-1'>
				<div className='p-4 space-y-3'>
					{messages.map((message) => {
						const contactInfo = formatContactName(message.contact)
						return (
							<div
								key={message.id}
								className='border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors'
							>
								<div className='flex items-start gap-3'>
									<Avatar className='h-10 w-10'>
										<AvatarImage
											src={message.contact?.photo?.full_photo || ""}
											alt={contactInfo.displayName}
										/>
										<AvatarFallback>{contactInfo.initials}</AvatarFallback>
									</Avatar>
									<div className='flex-1'>
										<div className='flex items-center justify-between mb-1'>
											<div className='flex flex-col'>
												<div className='font-medium'>
													{message.is_from_me ? "You" : contactInfo.displayName}
												</div>
												<div className='text-xs text-muted-foreground'>
													{getConversationName(message.chat_id)}
												</div>
											</div>
											<div className='flex items-center gap-2'>
												{message.chat_id && (
													<Button
														variant='outline'
														size='sm'
														onClick={() => openInMessages(message.chat_id!)}
													>
														<MessageCircle className='h-4 w-4 mr-2' />
														Open in Messages
													</Button>
												)}
												<Button
													variant='outline'
													onClick={() => {
														console.log(message.contact)
													}}
												>
													log contact
												</Button>
												<Button
													variant='outline'
													onClick={() => {
														console.log(message)
													}}
												>
													log message
												</Button>
											</div>
											<div className='text-xs text-muted-foreground'>
												{new Date(message.date * 1000).toLocaleString()}
											</div>
										</div>
										<p className='mt-1 text-xs opacity-50'>
											{!message.is_from_me && contactInfo.identifier}
										</p>

										<Separator className='my-2' />
										<div className='text-sm'>{message.text}</div>
										{message.attachment_path && (
											<div className='text-xs text-muted-foreground mt-2'>
												<img
													src={getAssetUrl(message.attachment_path)}
													alt='Attachment'
													className='max-w-sm rounded-lg shadow-lg'
												/>
											</div>
										)}
									</div>
								</div>
							</div>
						)
					})}
				</div>
			</ScrollArea>
		</div>
	)
}
