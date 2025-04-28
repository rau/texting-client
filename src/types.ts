export type Conversation = {
	id: string
	name: string | null
	last_message: string | null
	last_message_date: number
}

export type Message = {
	id: number
	text: string
	date: number
	is_from_me: boolean
	chat_id?: string
	sender_name?: string
	contact?: Contact
}

export type SearchResult = {
	messages: Message[]
	total_count: number
}

export type Contact = {
	contact_id: string
	emails: string[]
	phones: string[]
	first_name: string
	last_name: string
	nickname: string
	organization: string
	photo: ContactPhoto
}

export type ContactPhoto = {
	full_photo: string | null
	thumbnail: string | null
	legacy_photo: string | null
}
