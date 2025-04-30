import { invoke } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"

export const usePermissions = () => {
	const [hasPermissions, setHasPermissions] = useState<boolean | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	const checkPermissions = async (): Promise<boolean> => {
		try {
			const result = await invoke<boolean>("check_permissions")
			setHasPermissions(result)
			return result
		} catch (error) {
			console.error("Error checking permissions:", error)
			setHasPermissions(false)
			return false
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		checkPermissions()
	}, [])

	return {
		hasPermissions,
		isLoading,
		checkPermissions,
	}
}
