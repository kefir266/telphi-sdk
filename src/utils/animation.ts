import { keyframes } from '@mui/system'

// Pulsing animation for active call indicator (red)
const pulse = keyframes`
    0% {
        box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7);
    }
    70% {
        box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(244, 67, 54, 0);
    }
`

// Pulsing animation for reconnecting indicator (orange/warning)
const pulseWarning = keyframes`
    0% {
        box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7);
    }
    70% {
        box-shadow: 0 0 0 10px rgba(255, 152, 0, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(255, 152, 0, 0);
    }
`
export const animationStyles = (reconnecting: boolean) =>
    `${reconnecting ? pulseWarning : pulse} 2s infinite`
