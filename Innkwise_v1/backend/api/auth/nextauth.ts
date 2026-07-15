import NextAuth from "next-auth";
import { authOptions } from "@/backend/auth/next-auth-options";

export default NextAuth(authOptions);
