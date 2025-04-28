"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import {
	Calendar as CalendarIcon,
	Check,
	ChevronDown,
	Search,
	X,
} from "lucide-react"
import { useMemo, useState } from "react"

// Utility function to format phone numbers
const formatPhoneNumber = (phoneNumber: string): string => {
	// Remove any non-numeric characters if they somehow exist
	const cleaned = phoneNumber.replace(/\D/g, "")

	// Format as (XXX) XXX-XXXX if it's a 10-digit number
	if (cleaned.length === 10) {
		return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
	}

	// Format as +X (XXX) XXX-XXXX if it's 11 digits starting with 1
	if (cleaned.length === 11 && cleaned.startsWith("1")) {
		return `+${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(
			4,
			7
		)}-${cleaned.slice(7)}`
	}

	// Return as is if it doesn't match these patterns
	return cleaned
}

type ContactInfo = {
	id: string
	name: string
	type: "contact" | "email" | "phone"
	value?: string
	rawValue?: string // Store the raw (stripped) value for phone numbers
}

type ConversationInfo = {
	id: string
	name: string
	participants: ContactInfo[]
}

type ContactMap = {
	byId: Record<string, ContactInfo>
	byPhone: Record<string, ContactInfo>
	byEmail: Record<string, ContactInfo>
}

type AdvancedSearchProps = {
	onSearch: (params: SearchParams) => void
	contactMap: ContactMap
	conversations: ConversationInfo[]
}

export type SearchParams = {
	query: string
	startDate: Date | undefined
	endDate: Date | undefined
	selectedContacts: ContactInfo[]
	selectedConversation: ConversationInfo | null
}

export function AdvancedSearch({
	onSearch,
	contactMap,
	conversations,
}: AdvancedSearchProps) {
	const [searchParams, setSearchParams] = useState<SearchParams>({
		query: "",
		startDate: undefined,
		endDate: undefined,
		selectedContacts: [],
		selectedConversation: null,
	})

	// Collect all contacts from the contactMap and sort them alphabetically by name
	const contacts = useMemo(() => {
		return Object.values(contactMap.byId)
			.filter((contact) => contact.name.trim() !== "") // Filter out empty names
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((contact) => ({
				...contact,
				// Format phone numbers for display while keeping the raw value
				value:
					contact.type === "phone" && contact.value
						? formatPhoneNumber(contact.value)
						: contact.value,
			}))
	}, [contactMap])

	return (
		<div className='w-80 border-r border-border flex flex-col'>
			<div className='p-4 flex-1 overflow-auto w-full'>
				<h2 className='text-lg font-medium mb-4'>Message Search</h2>

				{/* Message Search */}
				<div className='space-y-2 mb-4 w-full'>
					<Label htmlFor='message-search' className='text-sm font-medium'>
						Search Content
					</Label>
					<div className='relative'>
						<Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
						<Input
							id='message-search'
							placeholder='Search message content...'
							className='pl-10'
							value={searchParams.query}
							onChange={(e) =>
								setSearchParams((prev) => {
									const newParams = {
										...prev,
										query: e.target.value,
									}
									onSearch(newParams)
									return newParams
								})
							}
						/>
					</div>
				</div>

				{/* Date Range Picker */}
				<div className='space-y-2 mb-4 w-full'>
					<Label htmlFor='date-range' className='text-sm font-medium'>
						Date Range
					</Label>
					<div className='flex items-center gap-2'>
						<Popover>
							<PopoverTrigger className='w-full'>
								<Button
									id='date-range'
									variant='outline'
									className={cn(
										"justify-start text-left font-normal w-full border-border hover:cursor-pointer hover:text-primary",
										!searchParams.startDate && "text-muted-foreground"
									)}
								>
									<CalendarIcon className='mr-2 h-4 w-4' />
									{searchParams.startDate
										? format(searchParams.startDate, "MM/dd/yy")
										: "Start date"}
								</Button>
							</PopoverTrigger>
							<PopoverContent className='w-auto p-0' align='start'>
								<Calendar
									mode='single'
									selected={searchParams.startDate}
									onSelect={(date) => {
										setSearchParams((prev) => {
											const newParams = {
												...prev,
												startDate: date,
											}
											onSearch(newParams)
											return newParams
										})
									}}
									initialFocus
								/>
							</PopoverContent>
						</Popover>

						<span className='text-muted-foreground'>to</span>

						<Popover>
							<PopoverTrigger className='w-full'>
								<Button
									variant='outline'
									className={cn(
										"justify-start text-left font-normal w-full border-border hover:cursor-pointer hover:text-primary",
										!searchParams.endDate && "text-muted-foreground"
									)}
								>
									<CalendarIcon className='mr-2 h-4 w-4' />
									{searchParams.endDate
										? format(searchParams.endDate, "MM/dd/yy")
										: "End date"}
								</Button>
							</PopoverTrigger>
							<PopoverContent className='w-auto p-0' align='start'>
								<Calendar
									mode='single'
									selected={searchParams.endDate}
									onSelect={(date) => {
										setSearchParams((prev) => {
											const newParams = {
												...prev,
												endDate: date,
											}
											onSearch(newParams)
											return newParams
										})
									}}
									initialFocus
								/>
							</PopoverContent>
						</Popover>
					</div>
				</div>

				{/* Contact Selector */}
				<div className='space-y-2 mb-4'>
					<Label htmlFor='contact-select' className='text-sm font-medium'>
						Select Contact(s)
					</Label>
					<Popover>
						<PopoverTrigger className='w-full'>
							<Button
								id='contact-select'
								variant='outline'
								role='combobox'
								className={cn(
									"justify-between w-full text-muted-foreground font-normal",
									"border-border hover:cursor-pointer hover:text-primary"
								)}
							>
								{searchParams.selectedContacts.length > 0
									? `${searchParams.selectedContacts.length} contact${
											searchParams.selectedContacts.length > 1 ? "s" : ""
									  } selected`
									: "Select contacts"}
								<ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
							</Button>
						</PopoverTrigger>
						<PopoverContent className='w-full p-0' align='start' side='bottom'>
							<Command className='w-[400px]'>
								<CommandInput placeholder='Search contacts...' />
								<CommandList>
									<CommandEmpty>No contacts found.</CommandEmpty>
									<CommandGroup>
										{contacts.map((contact) => (
											<CommandItem
												key={contact.id}
												onSelect={() => {
													setSearchParams((prev) => {
														const isAlreadySelected =
															prev.selectedContacts.some(
																(c) => c.id === contact.id
															)
														const newContacts = isAlreadySelected
															? prev.selectedContacts.filter(
																	(c) => c.id !== contact.id
															  )
															: [...prev.selectedContacts, contact]
														const newParams = {
															...prev,
															selectedContacts: newContacts,
														}
														onSearch(newParams)
														return newParams
													})
												}}
												className='flex items-center gap-2 cursor-pointer'
											>
												<div className='flex items-center gap-2 flex-1'>
													<Avatar className='h-8 w-8'>
														<AvatarFallback>
															{contact.name
																.split(" ")
																.map((n) => n[0])
																.join("")}
														</AvatarFallback>
													</Avatar>
													<div className='flex flex-col'>
														<span className='font-medium'>{contact.name}</span>
														<span className='text-xs text-muted-foreground'>
															{contact.value || contact.type}
														</span>
													</div>
												</div>
												{searchParams.selectedContacts.some(
													(c) => c.id === contact.id
												) && <Check className='h-4 w-4 ml-2' />}
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>

				{/* Selected Contacts Display */}
				{searchParams.selectedContacts.length > 0 && (
					<div className='flex flex-wrap gap-2 mb-4'>
						{searchParams.selectedContacts.map((contact) => (
							<Badge
								key={contact.id}
								variant='secondary'
								className='flex items-center gap-1 py-1 px-3'
							>
								<Avatar className='h-5 w-5 mr-1'>
									<AvatarImage src={"/placeholder.svg"} alt={contact.name} />
									<AvatarFallback className='text-[10px]'>
										{contact.name
											.split(" ")
											.map((n) => n[0])
											.join("")}
									</AvatarFallback>
								</Avatar>
								<span>{contact.name}</span>
								<Button
									variant='ghost'
									size='icon'
									className='h-4 w-4 ml-1 p-0'
									onClick={() => {
										setSearchParams((prev) => {
											const newParams = {
												...prev,
												selectedContacts: prev.selectedContacts.filter(
													(c) => c.id !== contact.id
												),
											}
											onSearch(newParams)
											return newParams
										})
									}}
								>
									<X className='h-3 w-3' />
									<span className='sr-only'>Remove</span>
								</Button>
							</Badge>
						))}
					</div>
				)}

				{/* Conversation Selector */}
				<div className='space-y-1.5'>
					<Label htmlFor='conversation-select' className='text-sm font-medium'>
						Select Conversation
					</Label>
					<Popover>
						<PopoverTrigger className='w-full'>
							<Button
								id='conversation-select'
								type='button'
								variant='outline'
								role='combobox'
								className={cn(
									"justify-between w-full border-border hover:cursor-pointer hover:text-primary font-normal",
									!searchParams.selectedConversation && "text-muted-foreground"
								)}
							>
								{searchParams.selectedConversation
									? searchParams.selectedConversation.name
									: "Select conversation"}
								<ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
							</Button>
						</PopoverTrigger>
						<PopoverContent className='w-full p-0' align='start' side='bottom'>
							<Command className='w-[400px]'>
								<CommandInput placeholder='Search conversations...' />
								<CommandList>
									<CommandEmpty>No conversations found.</CommandEmpty>
									<CommandGroup>
										{conversations.map((conversation) => (
											<CommandItem
												key={conversation.id}
												onSelect={() => {
													setSearchParams((prev) => {
														const newParams = {
															...prev,
															selectedConversation: conversation,
														}
														onSearch(newParams)
														return newParams
													})
												}}
												className='flex items-center gap-2 cursor-pointer'
											>
												<div className='flex flex-col'>
													<span className='font-medium'>
														{conversation.name}
													</span>
													<span className='text-xs text-muted-foreground'>
														{conversation.participants.length} participants
													</span>
												</div>
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</div>
	)
}
