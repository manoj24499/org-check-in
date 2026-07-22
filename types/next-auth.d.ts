import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "ADMIN" | "EMPLOYEE";
    employeeCode: string;
  }

  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "EMPLOYEE";
      employeeCode: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "EMPLOYEE";
    employeeCode: string;
  }
}
