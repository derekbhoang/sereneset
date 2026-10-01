import { TaskStatus } from "@sereneset/contracts";

export default function Home() {
  return (
    <main>
      <h1>SereneSet</h1>
      <p>Task statuses: {TaskStatus.options.join(", ")}</p>
    </main>
  );
}
