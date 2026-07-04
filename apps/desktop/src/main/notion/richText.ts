export function textRichText(content: string) {
  return [
    {
      type: "text",
      text: {
        content
      }
    }
  ];
}

export function titleProperty(title: string) {
  return {
    title: textRichText(title)
  };
}
