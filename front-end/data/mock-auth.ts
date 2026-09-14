export type AppRole = "vendor" | "reviewer" | "admin";

export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  organization: string;
};

export const DEMO_PASSWORD = "citysoft-demo";

export const demoUsers: MockUser[] = [
  { id: "vendor-anont", name: "Anont Saengsirithan", email: "anont@bangkokinnovations.example", role: "vendor", organization: "Bangkok Innovations Ltd." },
  { id: "reviewer-pimlada", name: "Pimlada Thepsiri", email: "pimlada@cityofsoftware.example", role: "reviewer", organization: "City of Software" },
  { id: "admin-narin", name: "Narin Anurak", email: "narin@cityofsoftware.example", role: "admin", organization: "City of Software" },
];
