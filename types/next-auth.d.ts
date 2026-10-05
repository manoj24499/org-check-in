import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "ADMIN" | "EMPLOYEE";
    employeeCode: string;
    organizationId: string;
  }

  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "EMPLOYEE";
      employeeCode: string;
      organizationId: string;
    } & DefaultSession["user"];
    /** ms epoch of the credential sign-in that created this session. */
    signedInAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "EMPLOYEE";
    employeeCode: string;
    organizationId: string;
    signedInAt?: number;
  }
}
