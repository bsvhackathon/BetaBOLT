// src/types/emotion.d.ts
import '@emotion/react';

declare module '@emotion/react' {
  export interface Theme {
    palette: {
      mode: string;
      primary: {
        main: string;
      };
      // Add other theme properties as needed
    };
  }
}