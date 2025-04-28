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
	contact_name?: string
}

export type SearchResult = {
	messages: Message[]
	total_count: number
}

export type ContactInfo = {
	id: string
	name: string
	type: "contact" | "email" | "phone"
	value?: string
}

export type ContactMap = {
	byId: Record<string, ContactInfo>
	byPhone: Record<string, ContactInfo>
	byEmail: Record<string, ContactInfo>
}
