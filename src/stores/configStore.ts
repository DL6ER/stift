import { create } from 'zustand'

export interface FooterLink {
  label: string
  url: string
}

interface ConfigState {
  registrationEnabled: boolean
  devMode: boolean
  compressUploads: boolean
  footerLinks: FooterLink[]
  sponsorUrl: string | null
  loaded: boolean
  fetchConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigState>((set) => ({
  registrationEnabled: true,
  devMode: false,
  compressUploads: true,
  footerLinks: [],
  sponsorUrl: null,
  loaded: false,
  fetchConfig: async () => {
    try {
      const res = await fetch('/api/config')
      if (res.ok) {
        const data = await res.json()
        set({
          registrationEnabled: data.registrationEnabled ?? true,
          devMode: !!data.devMode,
          compressUploads: data.compressUploads ?? true,
          footerLinks: Array.isArray(data.footerLinks) ? data.footerLinks : [],
          sponsorUrl: data.sponsorUrl || null,
          loaded: true,
        })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },
}))
