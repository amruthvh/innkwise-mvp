export async function fetchWithBackoff(url, options, retries = 4, baseDelay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);

      if (res.status === 429) {
        if (i < retries - 1) {
          const delay = baseDelay * Math.pow(2, i); // exponential
          console.warn(`429 Too Many Requests. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue; // retry
        }
      }

      // If not 429, return normally (even if it's another error)
      return res;
    } catch (err) {
      if (i === retries - 1) throw err; // last attempt, throw
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`Fetch error. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
