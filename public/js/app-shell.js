import appShellHtml from "../app-shell.html?raw";

const root = document.getElementById("root");

if (root) {
  if (!root.dataset.wtMounted) {
    root.innerHTML = appShellHtml;
    root.dataset.wtMounted = "1";
  }
} else if (!document.querySelector(".app")) {
  document.body.insertAdjacentHTML("afterbegin", appShellHtml);
}
