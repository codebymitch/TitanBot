// Theme configuration for the bot

export const theme = {
  colors: {
    // Brand colors
    primary: '#5865F2',    // Discord blurple
    secondary: '#2F3136',  // Dark theme background
    
    // Status colors
    success: '#43B581',    // Green
    error: '#F04747',      // Red
    warning: '#FAA61A',    // Yellow/Orange
    info: '#00B0F4',       // Blue
    
    // Grayscale
    light: '#FFFFFF',
    dark: '#202225',
    gray: '#99AAB5',
    
    // Special
    blurple: '#5865F2',
    green: '#57F287',
    yellow: '#FEE75C',
    fuchsia: '#EB459E',
    red: '#ED4245',
    black: '#000000',
    
    // Custom
    ticket: {
      open: '#43B581',
      claimed: '#FAA61A',
      closed: '#F04747',
      pending: '#99AAB5'
    },
    
    // Priority levels
    priority: {
      low: '#3498db',
      medium: '#2ecc71',
      high: '#f1c40f',
      urgent: '#e74c3c'
    }
  },
  
  // Get a color by path (e.g., 'primary', 'ticket.open', 'priority.high')
  getColor(path, fallback = '#99AAB5') {
    return path.split('.').reduce((obj, key) => 
      (obj && obj[key] !== undefined) ? obj[key] : fallback, 
    this.colors);
  },
  
  // Get a random color from the theme
  getRandomColor() {
    const colors = Object.values(this.colors).flatMap(color => 
      typeof color === 'string' ? color : Object.values(color)
    );
    return colors[Math.floor(Math.random() * colors.length)];
  }
};

// Helper function to get a color from the theme
export function getColor(path, fallback = '#99AAB5') {
  return theme.getColor(path, fallback);
}

// Export theme as default
export default theme;
