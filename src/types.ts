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
