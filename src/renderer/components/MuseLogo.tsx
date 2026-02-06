import React from 'react';

export function MuseLogo({ size = 24, className }: { size?: number, className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <defs>
                <linearGradient id="muse-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stopColor="currentColor" />
                    <stop offset="1" stopColor="currentColor" stopOpacity="0.8" />
                </linearGradient>
            </defs>
            {/* The "M" shape with a spark gap */}
            <path
                d="M4 20V6L10 14L12 11.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M20 20V6L14 14L12 11.5"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />

            {/* The Spark (Star) in the center */}
            <path
                d="M12 2L13 5L16 6L13 7L12 10L11 7L8 6L11 5L12 2Z"
                fill="currentColor"
                className="animate-pulse-slow"
            />
        </svg>
    );
}
