/**
 * Get the name of a month from its number (1-12)
 * @param {number} monthNum - The month number (1-12)
 * @returns {string} The month name or "Invalid Month" if invalid
 */
export function getMonthName(monthNum) {
    const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    return months[monthNum - 1] || "Invalid Month";
}

