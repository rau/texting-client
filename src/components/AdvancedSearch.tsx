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
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { AttachmentType, Contact, ConversationType } from "@/types"
import { format } from "date-fns"
import {
	Calendar as CalendarIcon,
	Check,
	ChevronDown,
	FileAudio,
	FileImage,
	FileText,
	FileVideo,
	Files,
	MessageCircle,
	MessagesSquare,
	Search,
	Users2,
	X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

type ConversationParticipant = {
	id: string
	name: string
	type: "contact"
}

type ConversationInfo = {
	id: string
	name: string
	participants: ConversationParticipant[]
}

type AdvancedSearchProps = {
	onSearch: (params: SearchParams) => void
	contacts: Contact[]
	conversations: ConversationInfo[]
}

export type SearchParams = {
	query: string
	startDate: Date | undefined
	endDate: Date | undefined
	selectedContacts: Contact[]
	selectedConversation: ConversationInfo | null
	showOnlyMyMessages: boolean
	showOnlyAttachments: boolean
	showOnlyLinks: boolean
	sortDirection: "asc" | "desc"
	conversationType: ConversationType
	attachmentType: AttachmentType
}

export function AdvancedSearch({
	onSearch,
	contacts,
	conversations,
}: AdvancedSearchProps) {
	const [searchParams, setSearchParams] = useState<SearchParams>({
		query: "",
		startDate: undefined,
		endDate: undefined,
		selectedContacts: [],
		selectedConversation: null,
		showOnlyMyMessages: false,
		showOnlyAttachments: false,
		showOnlyLinks: false,
		sortDirection: "desc",
		conversationType: "all",
		attachmentType: "all",
	})
	const [showOnlyContactsWithPhotos, setShowOnlyContactsWithPhotos] =
		useState(false)

	// Filter conversations based on type
	const filteredConversations = useMemo(() => {
		if (searchParams.conversationType === "all") {
			return conversations
		}
		return conversations.filter((conv) => {
			const isDirectMessage = conv.participants.length <= 1
			return searchParams.conversationType === "direct"
				? isDirectMessage
				: !isDirectMessage
		})
	}, [conversations, searchParams.conversationType])

	// Add useEffect to trigger initial search
	useEffect(() => {
		// Trigger search with empty parameters when component mounts
		console.log("searchParams", searchParams)
		onSearch(searchParams)
	}, []) // Empty dependency array means this runs once when component mounts

	// Updated contacts filtering to include photo filter
	const contactsArray = useMemo(() => {
		let filteredContacts = contacts.filter(
			(contact) => contact.first_name?.trim() !== ""
		) // Filter out empty names

		// Apply photo filter if enabled
		if (showOnlyContactsWithPhotos) {
			filteredContacts = filteredContacts.filter(
				(contact) => contact.photo?.full_photo
			)
		}

		return filteredContacts.sort(
			(a, b) => a.first_name?.localeCompare(b.first_name || "") || 0
		)
	}, [contacts, showOnlyContactsWithPhotos])

	// Add this after the Show Only Messages with Attachments Toggle
	const attachmentTypes: {
		value: AttachmentType
		label: string
		icon: React.ReactNode
	}[] = [
		{ value: "all", label: "All Types", icon: <Files className='h-4 w-4' /> },
		{
			value: "image",
			label: "Images",
			icon: <FileImage className='h-4 w-4' />,
		},
		{
			value: "video",
			label: "Videos",
			icon: <FileVideo className='h-4 w-4' />,
		},
		{ value: "pdf", label: "PDFs", icon: <FileText className='h-4 w-4' /> },
		{ value: "audio", label: "Audio", icon: <FileAudio className='h-4 w-4' /> },
		{
			value: "other",
			label: "Other Files",
			icon: <Files className='h-4 w-4' />,
		},
	]

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

				{/* Sort Direction Toggle */}
				<div className='space-y-2 mb-4'>
					<div className='flex items-center justify-between'>
						<Label htmlFor='sort-direction' className='text-sm font-medium'>
							Sort by Oldest First
						</Label>
						<Switch
							id='sort-direction'
							checked={searchParams.sortDirection === "asc"}
							onCheckedChange={(checked) => {
								setSearchParams((prev) => {
									const newParams = {
										...prev,
										sortDirection: checked
											? ("asc" as const)
											: ("desc" as const),
									}
									onSearch(newParams)
									return newParams
								})
							}}
						/>
					</div>
				</div>

				{/* Show Only My Messages Toggle */}
				<div className='space-y-2 mb-4'>
					<div className='flex items-center justify-between'>
						<Label htmlFor='show-my-messages' className='text-sm font-medium'>
							Show Only My Messages
						</Label>
						<Switch
							id='show-my-messages'
							checked={searchParams.showOnlyMyMessages}
							onCheckedChange={(checked) => {
								setSearchParams((prev) => {
									const newParams = {
										...prev,
										showOnlyMyMessages: checked,
									}
									onSearch(newParams)
									return newParams
								})
							}}
						/>
					</div>
				</div>

				{/* Show Only Messages with Attachments Toggle */}
				<div className='space-y-2 mb-4'>
					<div className='flex items-center justify-between'>
						<Label htmlFor='show-attachments' className='text-sm font-medium'>
							Show Only Messages with Attachments
						</Label>
						<Switch
							id='show-attachments'
							checked={searchParams.showOnlyAttachments}
							onCheckedChange={(checked) => {
								setSearchParams((prev) => {
									const newParams = {
										...prev,
										showOnlyAttachments: checked,
									}
									onSearch(newParams)
									return newParams
								})
							}}
						/>
					</div>
				</div>

				{/* Show Only Messages with Links Toggle */}
				<div className='space-y-2 mb-4'>
					<div className='flex items-center justify-between'>
						<Label htmlFor='show-links' className='text-sm font-medium'>
							Show Only Messages with Links
						</Label>
						<Switch
							id='show-links'
							checked={searchParams.showOnlyLinks}
							onCheckedChange={(checked) => {
								setSearchParams((prev) => {
									const newParams = {
										...prev,
										showOnlyLinks: checked,
									}
									onSearch(newParams)
									return newParams
								})
							}}
						/>
					</div>
				</div>

				{/* Add this after the Show Only Messages with Attachments Toggle */}
				<div className='space-y-2 mb-4'>
					<Label className='text-sm font-medium'>Attachment Type</Label>
					<div className='grid grid-cols-2 gap-2'>
						{attachmentTypes.map((type) => (
							<Button
								key={type.value}
								variant={
									searchParams.attachmentType === type.value
										? "default"
										: "outline"
								}
								className={cn(
									"flex items-center gap-2 justify-start",
									searchParams.attachmentType === type.value &&
										"bg-primary text-primary-foreground"
								)}
								onClick={() => {
									setSearchParams((prev) => {
										const newParams = {
											...prev,
											attachmentType: type.value,
										}
										onSearch(newParams)
										return newParams
									})
								}}
							>
								{type.icon}
								<span className='text-sm'>{type.label}</span>
							</Button>
						))}
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
										{contactsArray.map((contact) => (
											<CommandItem
												key={contact.contact_id}
												onSelect={() => {
													console.log("contact", contact)
													setSearchParams((prev) => {
														const isAlreadySelected =
															prev.selectedContacts.some(
																(c) => c.contact_id === contact.contact_id
															)
														const newContacts = isAlreadySelected
															? prev.selectedContacts.filter(
																	(c) => c.contact_id !== contact.contact_id
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
														<AvatarImage
															src={
																contact.photo?.full_photo ||
																contact.photo?.thumbnail ||
																undefined
															}
														/>
														<AvatarFallback>
															{contact.first_name
																? contact.first_name
																		.split(" ")
																		.map((n) => n[0])
																		.join("")
																: ""}
															{contact.last_name
																? contact.last_name
																		.split(" ")
																		.map((n) => n[0])
																		.join("")
																: ""}
														</AvatarFallback>
													</Avatar>
													<div className='flex flex-col'>
														<span className='font-medium'>
															{contact.first_name} {contact.last_name}
														</span>
														<span className='text-xs text-muted-foreground'>
															{contact.phones[0]}
														</span>
													</div>
												</div>
												{searchParams.selectedContacts.some(
													(c) => c.contact_id === contact.contact_id
												) && <Check className='h-4 w-4 ml-2' />}
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>

				{/* Show Only Contacts with Photos Toggle */}
				<div className='space-y-2 mb-4'>
					<div className='flex items-center justify-between'>
						<Label
							htmlFor='show-contacts-with-photos'
							className='text-sm font-medium'
						>
							Show Only Contacts with Photos
						</Label>
						<Switch
							id='show-contacts-with-photos'
							checked={showOnlyContactsWithPhotos}
							onCheckedChange={(checked) => {
								setShowOnlyContactsWithPhotos(checked)
								setSearchParams((prev) => {
									// If turning on the filter, remove selected contacts without photos
									const newSelectedContacts = checked
										? prev.selectedContacts.filter(
												(contact) => contact.photo?.full_photo
										  )
										: prev.selectedContacts

									const newParams = {
										...prev,
										showOnlyContactsWithPhotos: checked,
										selectedContacts: newSelectedContacts,
									}
									onSearch(newParams)
									return newParams
								})
							}}
						/>
					</div>
				</div>

				{/* Selected Contacts Display */}
				{searchParams.selectedContacts.length > 0 && (
					<div className='flex flex-wrap gap-2 mb-4'>
						{searchParams.selectedContacts.map((contact) => (
							<Badge
								key={contact.contact_id}
								variant='secondary'
								className='flex items-center gap-1 py-1 px-3'
							>
								<Avatar className='h-5 w-5 mr-1'>
									<AvatarImage
										alt={contact.first_name}
										src={
											contact.photo?.thumbnail ||
											contact.photo?.full_photo ||
											""
										}
									/>
									<AvatarFallback className='text-[10px]'>
										{contact.first_name
											? contact.first_name
													.split(" ")
													.map((n) => n[0])
													.join("")
											: ""}
									</AvatarFallback>
								</Avatar>
								<span>{contact.first_name}</span>
								<Button
									variant='ghost'
									size='icon'
									className='h-4 w-4 ml-1 p-0 hover:cursor-pointer hover:bg-transparent'
									onClick={() => {
										setSearchParams((prev) => {
											const newParams = {
												...prev,
												selectedContacts: prev.selectedContacts.filter(
													(c) => c.contact_id !== contact.contact_id
												),
											}
											console.log("newParams", newParams)
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

				<div className='space-y-1.5'>
					<Label htmlFor='conversation-select' className='text-sm font-medium'>
						Select Conversation
					</Label>

					{searchParams.selectedConversation ? (
						<Badge
							variant='secondary'
							className='w-full flex items-center justify-between py-2 px-3 h-10'
						>
							<div className='flex items-center gap-2'>
								{searchParams.selectedConversation.participants.length <= 1 ? (
									<MessageCircle className='h-4 w-4' />
								) : (
									<Users2 className='h-4 w-4' />
								)}
								<span>{searchParams.selectedConversation.name}</span>
							</div>
							<Button
								variant='ghost'
								size='icon'
								className='h-5 w-5 p-0 hover:bg-muted'
								onClick={(e) => {
									e.preventDefault()
									e.stopPropagation()
									// Create new params object with conversation cleared
									const newParams: SearchParams = {
										...searchParams,
										selectedConversation: null,
									}
									// Update local state
									setSearchParams(newParams)
									// Trigger parent search immediately with new params
									onSearch(newParams)
									console.log("Cleared conversation, new params:", newParams) // Debug log
								}}
							>
								<X className='h-3 w-3' />
								<span className='sr-only'>Clear conversation selection</span>
							</Button>
						</Badge>
					) : (
						<Popover>
							<PopoverTrigger className='w-full'>
								<Button
									id='conversation-select'
									type='button'
									variant='outline'
									role='combobox'
									className={cn(
										"justify-between w-full border-border hover:cursor-pointer hover:text-primary font-normal",
										"text-muted-foreground"
									)}
								>
									Select conversation
									<ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								className='w-full p-0'
								align='start'
								side='bottom'
							>
								<Command className='w-[400px]'>
									<CommandInput placeholder='Search conversations...' />
									<CommandList>
										<CommandEmpty>No conversations found.</CommandEmpty>
										<CommandGroup>
											{filteredConversations.map((conversation) => (
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
													<div className='flex items-center gap-2'>
														{conversation.participants.length <= 1 ? (
															<MessageCircle className='h-4 w-4' />
														) : (
															<Users2 className='h-4 w-4' />
														)}
														<div className='flex flex-col'>
															<span className='font-medium'>
																{conversation.name}
															</span>
															<span className='text-xs text-muted-foreground'>
																{conversation.participants.length <= 1
																	? "Direct Message"
																	: `${conversation.participants.length} participants`}
															</span>
														</div>
													</div>
												</CommandItem>
											))}
										</CommandGroup>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					)}
					<ToggleGroup
						type='single'
						value={searchParams.conversationType}
						onValueChange={(value: ConversationType) => {
							if (value) {
								// Only update if a value is selected
								setSearchParams((prev) => {
									// Clear selected conversation when changing type
									const newParams = {
										...prev,
										conversationType: value,
										selectedConversation: null,
									}
									onSearch(newParams)
									return newParams
								})
							}
						}}
						className='flex justify-between'
					>
						<ToggleGroupItem
							value='all'
							aria-label='Show all conversations'
							className='flex-1 gap-2 mt-1'
						>
							<MessagesSquare className='h-4 w-4' />
							All
						</ToggleGroupItem>
						<ToggleGroupItem
							value='direct'
							aria-label='Show direct messages only'
							className='flex-1 gap-2'
						>
							<MessageCircle className='h-4 w-4' />
							DMs
						</ToggleGroupItem>
						<ToggleGroupItem
							value='group'
							aria-label='Show group chats only'
							className='flex-1 gap-2'
						>
							<Users2 className='h-4 w-4' />
							Groups
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</div>
		</div>
	)
}
