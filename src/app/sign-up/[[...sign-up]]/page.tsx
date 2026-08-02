import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex justify-center py-10">
      <SignUp
        appearance={{
          variables: {
            colorPrimary: "#00d0ff",
            colorBackground: "#0b0d0b",
            colorForeground: "#d6e3d6",
            colorInput: "#0f120f",
            colorInputForeground: "#d6e3d6",
            colorNeutral: "#6e7f6e",
          },
          elements: {
            card: "border border-edge shadow-none",
            footer: "text-muted",
          },
        }}
      />
    </div>
  );
}
