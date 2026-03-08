import React from 'react';
import { clsx } from 'clsx';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
    size?: 'sm' | 'md';
}

export function Switch({ checked, onChange, disabled = false, className, size = 'md' }: SwitchProps) {
    const isSm = size === 'sm';
    
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={clsx(
                // Base structure
                "relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 hover:scale-[1.02]",
                // Size mapping
                isSm ? "h-5 w-9" : "h-6 w-11",
                // Background color based on state
                checked 
                    ? "bg-indigo-500 shadow-[0_0_15px_-3px_rgba(99,102,241,0.5)] dark:bg-indigo-600" 
                    : "bg-slate-200 dark:bg-white/10 shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)]",
                className
            )}
        >
            <span className="sr-only">Toggle</span>
            <span
                className={clsx(
                    // Knob structure
                    "pointer-events-none relative inline-block transform rounded-full bg-white shadow-lg ring-0 transition duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                    // Size mapping for knob
                    isSm ? "h-4 w-4" : "h-5 w-5",
                    // Move knob based on state
                    checked ? (isSm ? "translate-x-4" : "translate-x-5") : "translate-x-0"
                )}
            >
                {/* Visual feedback inside the knob */}
                <span 
                    className={clsx(
                        "absolute inset-0 flex items-center justify-center transition-opacity duration-500",
                        checked ? "opacity-100" : "opacity-0"
                    )}
                >
                    <svg className={clsx(isSm ? "h-2 w-2" : "h-2.5 w-2.5", "text-indigo-500")} fill="currentColor" viewBox="0 0 12 12">
                        <path d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z" />
                    </svg>
                </span>
                <span 
                    className={clsx(
                        "absolute inset-0 flex items-center justify-center transition-opacity duration-500",
                        checked ? "opacity-0" : "opacity-100"
                    )}
                >
                    <svg className={clsx(isSm ? "h-1.5 w-1.5" : "h-2 w-2", "text-slate-300")} fill="none" viewBox="0 0 12 12">
                        <path d="M4 8l4-4m0 4L4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </span>
            </span>
        </button>
    );
}
