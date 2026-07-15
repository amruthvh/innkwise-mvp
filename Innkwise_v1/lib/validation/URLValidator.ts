import { InputValidationError } from "@/lib/validation/ValidationErrors";

const supportedHosts = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "linkedin.com",
  "x.com",
  "twitter.com"
];

function hostnameMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export class URLValidator {
  normalize(value: string, options: { allowAnyWebsite?: boolean } = {}) {
    const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(value)
      ? value
      : `https://${value}`;

    let parsed: URL;
    try {
      parsed = new URL(withProtocol);
    } catch {
      throw new InputValidationError("INVALID_URL", "Please enter a valid URL.");
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new InputValidationError("INVALID_URL", "Only HTTP and HTTPS URLs are supported.");
    }

    parsed.hash = "";
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const isSupportedSocial = supportedHosts.some((domain) => hostnameMatches(hostname, domain));
    if (!isSupportedSocial && !options.allowAnyWebsite) {
      throw new InputValidationError("INVALID_URL", "This URL platform is not supported yet.");
    }

    parsed.hostname = hostname;
    return parsed.toString();
  }
}

export const urlValidator = new URLValidator();
