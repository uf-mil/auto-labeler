export function TimePassed(date: Date) {
    const current_date = new Date();
    console.log(date.toLocaleDateString())
    const time_passed = current_date.getTime() - date.getTime();
    console.log(time_passed)
    const seconds = Math.floor(time_passed / 1000);
    if (seconds >= 0 && seconds < 60) {
        return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
    } else if (seconds >= 60 && seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (seconds >= 3600 && seconds < 86400) {
        const hours = Math.floor(seconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (seconds >= 86400 && seconds < 604800) {
        const days = Math.floor(seconds / 86400);
        return `${days} day${days > 1 ? 's' : undefined} ago`;
    } else if (seconds >= 604800 && seconds < 2419200) {
        const weeks = Math.floor(seconds / 604800);
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (seconds >= 2419200 && seconds < 2419200 * 12) {
        const months = Math.floor(seconds / 2419200);
        return `${months} month${months > 1 ? 's' : ''} ago`;
    } else if (seconds < 1) return `${seconds} seconds from now`;
    else {
        const years = Math.floor(seconds / (2419200 * 12))
        return `${years} year${years > 1 ? 's' : ''} ago`
    }
}