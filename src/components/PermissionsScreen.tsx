import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { usePermissions } from "@/hooks/usePermissions"
import { openUrl } from "@tauri-apps/plugin-opener"
import { ChevronRight, LockIcon, RefreshCw, Settings2 } from "lucide-react"
import { useState } from "react"

const PermissionsScreen = () => {
	const { hasPermissions, checkPermissions } = usePermissions()
	const [isChecking, setIsChecking] = useState(false)

	// ventura+ still accepts the old pane id if you go through NSWorkspace,
	// which is exactly what openUrl does under the hood.
	const openFullDiskAccess = async () => {
		try {
			await openUrl(
				"x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
			)
		} catch {
			// belt-and-suspenders: if apple ever flips the id again
			await openUrl(
				"x-apple.settings:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles"
			)
		}
	}

	const handleCheckPermissions = async () => {
		setIsChecking(true)
		try {
			const hasAccess = await checkPermissions()
			if (hasAccess === true) {
				// If permissions are granted, restart the app
				try {
					// @ts-ignore - Tauri command
					await window.__TAURI__.invoke("restart_app")
				} catch (error) {
					console.error("Failed to restart app:", error)
					// Fallback to reload if restart fails
					window.location.reload()
				}
			}
		} finally {
			setIsChecking(false)
		}
	}

	if (hasPermissions === null) {
		return (
			<div className='flex items-center justify-center min-h-screen'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900'></div>
			</div>
		)
	}

	if (hasPermissions) {
		return null
	}

	return (
		<div className='flex items-center justify-center min-h-screen bg-background p-4'>
			<Card className='w-full max-w-md shadow-lg'>
				<CardHeader className='text-center pb-2'>
					<div className='mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center'>
						<LockIcon className='h-6 w-6 text-primary' />
					</div>
					<CardTitle className='text-2xl'>Full Disk Access Required</CardTitle>
					<CardDescription className='text-sm text-muted-foreground pt-1.5'>
						iMessage Search needs permission to access your messages database
					</CardDescription>
				</CardHeader>

				<Separator />

				<CardContent className='py-2'>
					<div className='space-y-6'>
						<div className='space-y-2'>
							<h3 className='font-medium'>Why we need this permission:</h3>
							<p className='text-sm text-muted-foreground'>
								To search through your iMessages, we need access to the message
								database files on your Mac. macOS protects these files, so
								you'll need to grant Full Disk Access permission.
							</p>
						</div>

						<div className='space-y-3'>
							<h3 className='font-medium'>How to enable Full Disk Access:</h3>
							<ol className='space-y-4 mt-2'>
								<li className='flex gap-3'>
									<div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-xs'>
										1
									</div>
									<div className='space-y-1'>
										<p className='text-sm'>
											Open System Settings and go to Privacy & Security
										</p>
									</div>
								</li>
								<li className='flex gap-3'>
									<div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-xs'>
										2
									</div>
									<div className='space-y-1'>
										<p className='text-sm'>
											Scroll down and click on "Full Disk Access"
										</p>
									</div>
								</li>
								<li className='flex gap-3'>
									<div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-xs'>
										3
									</div>
									<div className='space-y-1'>
										<p className='text-sm'>
											Click the "+" button and add "iMessage Search" to the list
										</p>
									</div>
								</li>
								<li className='flex gap-3'>
									<div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-xs'>
										4
									</div>
									<div className='space-y-1'>
										<p className='text-sm'>
											Toggle the switch next to "iMessage Search" to enable
											access
										</p>
									</div>
								</li>
							</ol>
						</div>
					</div>
				</CardContent>

				<CardFooter className='flex flex-col gap-2 pt-2'>
					<Button className='w-full' onClick={openFullDiskAccess}>
						<Settings2 className='mr-2 h-4 w-4' />
						Open System Settings
					</Button>
					<Button
						variant='outline'
						className='w-full'
						onClick={handleCheckPermissions}
						disabled={isChecking}
					>
						{isChecking ? (
							<>
								<RefreshCw className='mr-2 h-4 w-4 animate-spin' />
								Checking Permissions...
							</>
						) : (
							<>
								<ChevronRight className='mr-2 h-4 w-4' />
								I've Granted Permission
							</>
						)}
					</Button>
				</CardFooter>
			</Card>
		</div>
	)
}

export default PermissionsScreen
