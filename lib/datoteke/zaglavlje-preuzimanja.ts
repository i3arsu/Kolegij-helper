
function kodiranaPutanjaNaziva(naziv: string): string {
  return encodeURIComponent(naziv).replace(
    /['()*]/g,
    (znak) =>
      `%${znak.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function zaglavljePreuzimanja(naziv: string): string {
  return (
    `attachment; filename="download"; ` +
    `filename*=UTF-8''${kodiranaPutanjaNaziva(naziv)}`
  );
}
