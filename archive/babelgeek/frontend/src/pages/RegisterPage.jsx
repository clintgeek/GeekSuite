import React from "react";
import { GeekLogin } from "@geeksuite/auth";

const RegisterPage = () => (
  <GeekLogin
    appName="BabelGeek"
    tagline="Master languages with spaced repetition"
    accentColor="#06b6d4"
    returnTo={`${window.location.origin}/learn`}
  />
);

export default RegisterPage;
