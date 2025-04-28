import { Conversation } from "../types"

type ConversationsListProps = {
	conversations: Conversation[]
	loading: boolean
	error: string | null
	selectedConversation: string | null
	conversationTitles: Record<string, string>
	handleSelectConversation: (conversationId: string) => void
}

export function ConversationsList({
	conversations,
	loading,
	error,
	selectedConversation,
	conversationTitles,
	handleSelectConversation,
}: ConversationsListProps) {
	return (
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
										selectedConversation === conversation.id ? "bg-blue-50" : ""
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
	)
}
