import { arm, configure, onEvent, runInTrigger, type CaptureEvent } from "../src/index";
import { big, collect, hashPassword, login, register } from "./accounts";

const events: CaptureEvent[] = [];
onEvent((event) => events.push(event));

configure({ denyKeys: ["ssn"], maxBytes: 200 });
arm("secrets");

await runInTrigger("t1", async () => {
  login("a@b.c", "hunter2", { token: "tok_123", note: "hello" });
  hashPassword("hunter2");
  register({ email: "a@b.c", password: "hunter2" });
  collect("tok_a", "tok_b");
  big("x".repeat(5000));
});

console.log(JSON.stringify(events));
