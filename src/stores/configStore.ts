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
  oidcEnabled: boolean
  oidcLoginLabel: string
  loaded: boolean
  fetchConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigState>((set) => ({
  registrationEnabled: true,
  devMode: false,
  compressUploads: true,
  footerLinks: [],
  sponsorUrl: null,
  oidcEnabled: false,
  oidcLoginLabel: 'Mit Single Sign-On anmelden',
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
          oidcEnabled: !!data.oidcEnabled,
          oidcLoginLabel: typeof data.oidcLoginLabel === 'string' && data.oidcLoginLabel
            ? data.oidcLoginLabel
            : 'Mit Single Sign-On anmelden',
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
