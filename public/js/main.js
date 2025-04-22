// Main JavaScript for Outlook Email Assistant

document.addEventListener('DOMContentLoaded', function() {
    // Set up tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Auto refresh for email list page
    if (window.location.pathname === '/emails') {
      // Refresh the page every 5 minutes to check for new emails
      setTimeout(() => {
        window.location.reload();
      }, 5 * 60 * 1000);
    }
    
    // Any additional functionality can be added here
  });