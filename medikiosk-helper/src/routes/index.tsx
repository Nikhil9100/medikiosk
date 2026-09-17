import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediKiosk — Patient UI design work" },
      {
        name: "description",
        content:
          "Workspace notes for the MediKiosk patient console visual improvement work. The MediKiosk app itself lives in the medikiosk folder and runs on its own.",
      },
      { property: "og:title", content: "MediKiosk — Patient UI design work" },
      {
        property: "og:description",
        content:
          "Workspace notes for the MediKiosk patient console visual improvement work.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        MediKiosk — patient screen improvements
      </h1>
      <p className="text-muted-foreground">
        The MediKiosk application code lives in the <code>medikiosk</code> folder of this
        workspace. Its patient screens are being improved in place — same steps, same
        wording, same behaviour, better look and feel.
      </p>
      <p className="text-muted-foreground">
        MediKiosk runs on its own server, so it is not shown in this preview pane. Review
        happens through the before/after captures shared in chat.
      </p>
    </main>
  );
}
