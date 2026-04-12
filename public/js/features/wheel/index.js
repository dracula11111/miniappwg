import "../../../css/wheel.css";

await import("./wheel.js");
await Promise.all([
  import("./wildtime.js"),
  import("./bonus-5050.js"),
  import("./lootrush.js")
]);
