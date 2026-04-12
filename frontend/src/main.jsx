import { createRoot } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import App from "./App.jsx";
import "./styles.css";

const root = document.getElementById("root");
createRoot(root).render(
	<ChakraProvider value={defaultSystem}>
		<App />
	</ChakraProvider>
);
