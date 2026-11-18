export async function reportBusinessLoginFailure(email: string) {
  try {
    const response = await fetch("/api/business/login-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      console.error("Repeated business login attempt could not be recorded.");
    }
  } catch (error) {
    console.error("Repeated business login attempt report failed:", error);
  }
}
