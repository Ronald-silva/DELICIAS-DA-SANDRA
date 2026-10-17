// Só conta como foto do produto o que a Sandra cadastrou. A imagem de
// demonstração continua existindo como preenchimento visual, mas quem a
// exibe precisa poder dizer ao visitante que ela é ilustrativa — por isso a
// checagem é exportada em vez de ficar escondida dentro de productImageSrc.
export function hasRealProductImage(product: { imageUrl?: string }): boolean {
  return typeof product.imageUrl === "string" && product.imageUrl.trim() !== "";
}

export function productImageSrc(product: { imageUrl?: string }): string {
  return hasRealProductImage(product) ? product.imageUrl! : "/images/brownie-hero-demo.webp";
}
