import Loader from "@/components/Loader"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { Contact, Message } from "@/types"
import { convertFileSrc } from "@tauri-apps/api/core"
import { homeDir } from "@tauri-apps/api/path"
import { useEffect, useState } from "react"
import { Badge } from "./ui/badge"
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

// Add this helper function to render attachments based on MIME type
const AttachmentView = ({
	path,
	mimeType,
	getAssetUrl,
}: {
	path: string
	mimeType?: string
	getAssetUrl: (path: string) => string
}) => {
	const url = getAssetUrl(path)

	// Handle images
	if (mimeType?.startsWith("image/")) {
		return (
			<img
				src={url}
				alt='Image attachment'
				className='max-w-sm rounded-lg shadow-lg'
			/>
		)
	}

	// Handle videos
	if (mimeType?.startsWith("video/")) {
		return (
			<video controls className='max-w-sm rounded-lg shadow-lg'>
				<source src={url} type={mimeType} />
				Your browser does not support the video tag.
			</video>
		)
	}

	// Handle PDFs
	if (mimeType === "application/pdf") {
		return (
			<div className='flex flex-col gap-2'>
				<object
					data={url}
					type='application/pdf'
					className='max-w-sm h-[400px] rounded-lg shadow-lg'
				>
					<p>
						Unable to display PDF.{" "}
						<a
							href={url}
							target='_blank'
							rel='noreferrer'
							className='text-primary hover:underline'
						>
							Open PDF
						</a>
					</p>
				</object>
			</div>
		)
	}

	// Handle audio
	if (mimeType?.startsWith("audio/")) {
		return (
			<audio controls className='max-w-sm'>
				<source src={url} type={mimeType} />
				Your browser does not support the audio element.
			</audio>
		)
	}

	// For all other types, show a download link
	return (
		<Button variant='outline' size='sm' asChild>
			<a href={url} target='_blank' rel='noreferrer' className='no-underline'>
				Download Attachment
			</a>
		</Button>
	)
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
		<div className='flex flex-col overflow-y-auto'>
			<ScrollArea className='flex-1'>
				<div className='p-4 space-y-3'>
					{messages.map((message) => {
						const contactInfo = formatContactName(message.contact)
						return (
							<div
								key={message.id}
								className={cn(
									"overflow-hidden border rounded-xl",
									message.is_from_me ? "border-blue-100" : "border-border"
								)}
							>
								<div className='flex flex-row items-center justify-between p-3 bg-muted/30'>
									<div className='flex items-center gap-3'>
										<Avatar className={cn("h-9 w-9")}>
											<AvatarImage
												src={message.contact?.photo?.full_photo || ""}
												alt={contactInfo.displayName}
											/>
											<AvatarFallback>{contactInfo.initials}</AvatarFallback>
										</Avatar>

										<div>
											<div className='font-medium text-sm flex items-center gap-2'>
												{message.is_from_me ? "Me" : contactInfo.displayName}
												{message.is_from_me && (
													<Badge
														variant='secondary'
														className='text-[10px] font-normal py-0 h-4'
													>
														Me
													</Badge>
												)}
											</div>
											<div className='text-xs text-muted-foreground flex items-center gap-1'>
												<span>{getConversationName(message.chat_id)}</span>
											</div>
										</div>
									</div>
									<div className='text-xs text-muted-foreground'>
										{new Date(message.date * 1000).toLocaleString()}
									</div>
								</div>
								<div
									className={cn(
										"p-3",
										message.is_from_me ? "bg-blue-50" : "bg-background"
									)}
								>
									{message.attachment_path === null && (
										<div className='flex'>
											<div
												className={cn(
													"py-2 px-3 rounded-2xl text-sm max-w-[85%]",
													message.is_from_me
														? "bg-blue-500 text-white ml-auto rounded-tr-sm"
														: "bg-muted rounded-tl-sm"
												)}
											>
												{message.text}
											</div>
										</div>
									)}
									{message.attachment_path && (
										<div className='text-xs text-muted-foreground mt-2'>
											<AttachmentView
												path={message.attachment_path}
												mimeType={message.attachment_mime_type}
												getAssetUrl={getAssetUrl}
											/>
										</div>
									)}
								</div>
								<div className='p-2 flex justify-end gap-2 border-t border-border bg-muted/30'>
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
							</div>
						)
					})}
				</div>
			</ScrollArea>
		</div>
	)
}
