import React from "react";
import ReactDOM from "react-dom/client";
import { ReaderApp } from "./ReaderApp.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReaderApp />
  </React.StrictMode>,
);
