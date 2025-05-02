export type Conversation = {
	id: string
	name: string | null
	last_message: string | null
	last_message_date: number
	participants: {
		id: string
		name: string
		type: "contact"
	}[]
}

export type Message = {
	id: number
	text: string
	date: number
	is_from_me: boolean
	chat_id?: string
	sender_name?: string
	contact?: Contact
	attachment_path?: string
	attachment_mime_type?: string
	conversation_name: string
}

export type SearchResult = {
	messages: Message[]
}

export type Contact = {
	contact_id: string
	emails: string[]
	phones: string[]
	first_name: string | undefined
	last_name: string | undefined
	nickname: string
	organization: string
	photo: ContactPhoto
}

export type ContactPhoto = {
	full_photo: string | null
	thumbnail: string | null
	legacy_photo: string | null
}

export type ConversationType = "all" | "direct" | "group"

export type ConversationInfo = {
	id: string
	name: string
	participants: {
		id: string
		name: string
		type: "contact"
	}[]
}

export type AttachmentType =
	| "all"
	| "image"
	| "video"
	| "pdf"
	| "audio"
	| "other"

export type SearchParams = {
	query: string
	startDate: Date | undefined
	endDate: Date | undefined
	selectedContacts: Contact[]
	selectedConversation: ConversationInfo | null
	showOnlyMyMessages: boolean
	showOnlyAttachments: boolean
	sortDirection: "asc" | "desc"
	conversationType: ConversationType
	attachmentType: AttachmentType
}
