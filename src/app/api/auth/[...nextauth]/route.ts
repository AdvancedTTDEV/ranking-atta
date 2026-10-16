import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// El callback signIn puede reintentar la BD dormida (~25s en el peor caso).
export const maxDuration = 30

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
