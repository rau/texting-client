"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Calendar as CalendarIcon, ChevronDown, Search, X } from "lucide-react"
import React, { useState } from "react"

type ContactInfo = {
	id: string
	name: string
	type: "contact" | "email" | "phone"
	value?: string
}

type ContactMap = {
	byId: Record<string, ContactInfo>
	byPhone: Record<string, ContactInfo>
	byEmail: Record<string, ContactInfo>
}

type AdvancedSearchProps = {
	onSearch: (params: SearchParams) => void
	isSearching: boolean
	contactMap: ContactMap
}

export type SearchParams = {
	query: string
	startDate: Date | undefined
	endDate: Date | undefined
	selectedContact: ContactInfo | null
}

export function AdvancedSearch({
	onSearch,
	isSearching,
	contactMap,
}: AdvancedSearchProps) {
	const [searchParams, setSearchParams] = useState<SearchParams>({
		query: "",
		startDate: undefined,
		endDate: undefined,
		selectedContact: null,
	})
	// Collect all contacts from the contactMap
	const contacts = Object.values(contactMap.byId)

	const handleSearch = () => {
		onSearch(searchParams)
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleSearch()
		}
	}

	const clearSelectedContact = () => {
		setSearchParams((prev) => ({
			...prev,
			selectedContact: null,
		}))
	}

	return (
		<Card className='w-full max-w-4xl mx-auto shadow-sm'>
			<CardHeader className='border-b pb-2'>
				<CardTitle className='text-xl font-semibold'>Message Search</CardTitle>
			</CardHeader>
			<CardContent className='pt-4'>
				<div className='grid gap-4'>
					<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
						{/* Date Range Picker */}
						<div className='space-y-1.5'>
							<Label htmlFor='date-range' className='text-sm font-medium'>
								Date Range
							</Label>
							<div className='flex items-center gap-2'>
								<Popover>
									<PopoverTrigger>
										<Button
											id='date-range'
											type='button'
											variant='outline'
											className={cn(
												"justify-start text-left font-normal w-full",
												!searchParams.startDate && "text-muted-foreground"
											)}
										>
											<CalendarIcon className='mr-2 h-4 w-4' />
											{searchParams.startDate
												? format(searchParams.startDate, "PPP")
												: "Start date"}
										</Button>
									</PopoverTrigger>
									<PopoverContent className=''>
										<Calendar
											mode='single'
											selected={searchParams.startDate}
											onSelect={(date) => {
												setSearchParams((prev) => ({
													...prev,
													startDate: date,
												}))
											}}
											initialFocus
										/>
									</PopoverContent>
								</Popover>

								<span className='text-muted-foreground'>to</span>

								<Popover>
									<PopoverTrigger>
										<Button
											type='button'
											variant='outline'
											className={cn(
												"justify-start text-left font-normal w-full",
												!searchParams.endDate && "text-muted-foreground"
											)}
										>
											<CalendarIcon className='mr-2 h-4 w-4' />
											{searchParams.endDate
												? format(searchParams.endDate, "PPP")
												: "End date"}
										</Button>
									</PopoverTrigger>
									<PopoverContent
										className='w-auto p-0'
										align='start'
										side='bottom'
									>
										<Calendar
											mode='single'
											selected={searchParams.endDate}
											onSelect={(date) => {
												setSearchParams((prev) => ({
													...prev,
													endDate: date,
												}))
											}}
											initialFocus
										/>
									</PopoverContent>
								</Popover>
							</div>
						</div>

						{/* Contact Selector */}
						<div className='space-y-1.5'>
							<Label htmlFor='contact-select' className='text-sm font-medium'>
								Select Contact
							</Label>
							<Popover>
								<PopoverTrigger>
									<Button
										id='contact-select'
										type='button'
										variant='outline'
										role='combobox'
										className={cn(
											"justify-between w-full",
											!searchParams.selectedContact && "text-muted-foreground"
										)}
									>
										{searchParams.selectedContact
											? searchParams.selectedContact.name
											: "Select contact"}
										<ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
									</Button>
								</PopoverTrigger>
								<PopoverContent
									className='w-full p-0'
									align='start'
									side='bottom'
								>
									<Command className='w-[400px]'>
										<CommandInput placeholder='Search contacts...' />
										<CommandList>
											<CommandEmpty>No contacts found.</CommandEmpty>
											<CommandGroup>
												{contacts.map((contact) => (
													<CommandItem
														key={contact.id}
														onSelect={() => {
															setSearchParams((prev) => ({
																...prev,
																selectedContact: contact,
															}))
														}}
														className='flex items-center gap-2 cursor-pointer'
													>
														<Avatar className='h-8 w-8'>
															<AvatarFallback>
																{contact.name
																	.split(" ")
																	.map((n) => n[0])
																	.join("")}
															</AvatarFallback>
														</Avatar>
														<div className='flex flex-col'>
															<span className='font-medium'>
																{contact.name}
															</span>
															<span className='text-xs text-muted-foreground'>
																{contact.value || contact.type}
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

					{/* Selected Contact Display */}
					{searchParams.selectedContact && (
						<div className='flex flex-wrap gap-2'>
							<Badge
								variant='secondary'
								className='flex items-center gap-1 py-1 px-3'
							>
								<Avatar className='h-5 w-5 mr-1'>
									<AvatarFallback>
										{searchParams.selectedContact.name
											.split(" ")
											.map((n) => n[0])
											.join("")}
									</AvatarFallback>
								</Avatar>
								<span>{searchParams.selectedContact.name}</span>
								<Button
									variant='ghost'
									size='icon'
									className='h-4 w-4 ml-1 p-0'
									onClick={clearSelectedContact}
								>
									<X className='h-3 w-3' />
									<span className='sr-only'>Remove</span>
								</Button>
							</Badge>
						</div>
					)}

					{/* Message Search */}
					<div className='space-y-1.5'>
						<Label htmlFor='message-search' className='text-sm font-medium'>
							Search Messages
						</Label>
						<div className='relative'>
							<Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
							<Input
								id='message-search'
								placeholder='Search message content...'
								className='pl-10'
								value={searchParams.query}
								onChange={(e) =>
									setSearchParams((prev) => ({
										...prev,
										query: e.target.value,
									}))
								}
								onKeyDown={handleKeyDown}
							/>
						</div>
					</div>

					{/* Search Button */}
					<Button
						className='w-full'
						size='lg'
						onClick={handleSearch}
						disabled={isSearching}
					>
						{isSearching ? "Searching..." : "Search Messages"}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
