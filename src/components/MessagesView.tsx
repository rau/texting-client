import Loader from "@/components/Loader"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Message } from "../global"

type MessagesViewProps = {
	loading: boolean
	messages: Message[]
}

export function MessagesView({ loading, messages }: MessagesViewProps) {
	const hasSearched = messages !== null

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

	return (
		<div className='flex-1 flex flex-col overflow-y-auto'>
			<ScrollArea className='flex-1'>
				<div className='p-4 space-y-3'>
					{messages.map((message) => (
						<div
							key={message.id}
							className='border rounded-lg p-4 hover:bg-muted/50 transition-colors'
						>
							<div className='flex items-start gap-3'>
								<Avatar className='h-10 w-10'>
									<AvatarImage
										src='/placeholder.svg?height=40&width=40'
										alt={message.contact_name || ""}
									/>
									<AvatarFallback>
										{(message.contact_name || "").substring(0, 2).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div className='flex-1'>
									<div className='flex items-center justify-between mb-1'>
										<div className='font-medium'>
											{message.is_from_me ? "You" : message.contact_name || ""}
										</div>
										<div className='text-xs text-muted-foreground'>
											{new Date(message.date * 1000).toLocaleString()}
										</div>
									</div>
									<Separator className='my-2' />
									<div className='text-sm'>{message.text}</div>
								</div>
							</div>
						</div>
					))}
				</div>
			</ScrollArea>
		</div>
	)
}
