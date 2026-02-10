import React from 'react';

export function GeniLogo({ size = 24, className }: { size?: number, className?: string }) {
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
                <linearGradient id="geni-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                    <stop stopColor="currentColor" />
                    <stop offset="1" stopColor="currentColor" stopOpacity="0.8" />
                </linearGradient>
            </defs>
            {/* Abstract G-like shape / Tech Spark */}
            <path
                d="M18 11V6C18 4.89543 17.1046 4 16 4H8C5.79086 4 4 5.79086 4 8V16C4 18.2091 5.79086 20 8 20H16C17.1046 20 18 19.1046 18 18V13H12"
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
