import React from 'react';

/**
 * Regex to detect URLs in text
 * Matches http, https, www, and common domain patterns
 */
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

/**
 * Regex to detect phone numbers (Brazilian format)
 */
const PHONE_REGEX = /(\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/g;

/**
 * Renders text with clickable links
 * Converts URLs and phone numbers to clickable elements
 */
export function renderTextWithLinks(text: string): React.ReactNode {
  if (!text) return null;
  
  // Split by URL pattern while keeping the delimiters
  const parts = text.split(URL_REGEX);
  
  if (parts.length === 1 && !URL_REGEX.test(text)) {
    // No URLs found, return plain text
    return text;
  }
  
  return parts.map((part, index) => {
    if (!part) return null;
    
    // Check if this part is a URL
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0; // Reset regex state
      
      // Add protocol if missing
      let href = part;
      if (part.startsWith('www.')) {
        href = `https://${part}`;
      }
      
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600 hover:underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    
    // Regular text
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Formats phone number for WhatsApp link
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-numeric characters
  return phone.replace(/\D/g, '');
}

/**
 * Creates a WhatsApp link for a phone number
 */
export function createWhatsAppLink(phone: string): string {
  const cleanPhone = formatPhoneForWhatsApp(phone);
  return `https://wa.me/${cleanPhone}`;
}
