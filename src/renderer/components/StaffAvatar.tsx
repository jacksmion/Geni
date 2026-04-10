import React from 'react'
import {
    Bot, User, GraduationCap, Cpu, BarChart3, Globe,
    Sparkles, Code2, Terminal, Wrench, ShieldAlert,
    Search, Briefcase, Palette, PenTool, BookOpen, Rocket,
    type LucideIcon
} from 'lucide-react'

/**
 * Preset icon mapping for staff avatars.
 * Key = identifier stored in StaffProfile.avatar
 * Value = corresponding Lucide icon component
 *
 * If avatar value is NOT in this map, it renders as emoji/text.
 */
export const STAFF_ICONS: Record<string, LucideIcon> = {
    Bot,
    User,
    GraduationCap,
    Cpu,
    BarChart3,
    Globe,
    Sparkles,
    Code2,
    Terminal,
    Wrench,
    ShieldAlert,
    Search,
    Briefcase,
    Palette,
    PenTool,
    BookOpen,
    Rocket,
}

interface StaffAvatarProps {
    avatar?: string
    name?: string
    size?: number
    className?: string
    iconClassName?: string
}

/**
 * Auto-detects render mode based on avatar value:
 * - Matches STAFF_ICON key → renders Lucide icon
 * - Other string → renders as emoji/text
 * - No avatar → falls back to name initial or Bot icon
 */
export function StaffAvatar({ avatar, name, size = 16, className, iconClassName }: StaffAvatarProps) {
    const IconComponent = avatar ? STAFF_ICONS[avatar] : undefined

    if (IconComponent) {
        return <IconComponent size={size} className={iconClassName} />
    }

    if (avatar) {
        const fontSize = Math.round(size * 0.9)
        return <span className={className} style={{ fontSize, lineHeight: 1 }}>{avatar}</span>
    }

    if (name) {
        const fontSize = Math.round(size * 0.65)
        return <span className={className} style={{ fontSize, fontWeight: 700, lineHeight: 1 }}>{name.charAt(0).toUpperCase()}</span>
    }

    return <Bot size={size} className={iconClassName} />
}