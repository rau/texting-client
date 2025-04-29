import Loader from "@/components/Loader"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Message } from "@/types"
import { convertFileSrc } from "@tauri-apps/api/core"
import { homeDir } from "@tauri-apps/api/path"
import { useEffect, useState } from "react"

type MessagesViewProps = {
	loading: boolean
	messages: Message[]
}

export function MessagesView({ loading, messages }: MessagesViewProps) {
	const [homePath, setHomePath] = useState<string>("")
	const hasSearched = messages !== null

	useEffect(() => {
		// Get the home directory path when component mounts
		homeDir().then(setHomePath).catch(console.error)
	}, [])

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
					{messages.map((message) => (
						<div
							key={message.id}
							className='border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors'
						>
							<div className='flex items-start gap-3'>
								<Avatar className='h-10 w-10'>
									<AvatarImage
										src={message.contact?.photo?.full_photo || ""}
										alt={
											message.contact?.first_name +
												" " +
												message.contact?.last_name || ""
										}
									/>
									<AvatarFallback>
										{(message.contact?.first_name || "")
											.substring(0, 1)
											.toUpperCase() +
											(message.contact?.last_name
												? message.contact?.last_name
														.substring(0, 1)
														.toUpperCase()
												: "")}
									</AvatarFallback>
								</Avatar>
								<div className='flex-1'>
									<div className='flex items-center justify-between mb-1'>
										<div className='font-medium'>
											{message.is_from_me
												? "You"
												: message.contact?.first_name +
														" " +
														message.contact?.last_name || ""}
										</div>
										<div className='text-xs text-muted-foreground'>
											{new Date(message.date * 1000).toLocaleString()}
										</div>
									</div>
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
					))}
				</div>
			</ScrollArea>
		</div>
	)
}
