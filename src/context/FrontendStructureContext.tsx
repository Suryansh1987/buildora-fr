import { createContext, useState } from "react";
import type { ReactNode } from "react";

// Define the context type
interface ContextValue {
  value: any;
  setValue: (value: any) => void;
}

// 1. Create the context with a default value
export const MyContext = createContext<ContextValue>({
  value: {},
  setValue: () => {},
});

// 2. Create a provider component
export const MyContextProvider = ({ children }: { children: ReactNode }) => {
  const [value, setValue] = useState({});

  return (
    <MyContext.Provider value={{ value, setValue }}>
      {children}
    </MyContext.Provider>
  );
};
