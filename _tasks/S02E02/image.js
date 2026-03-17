import sharp from 'sharp';

export async function crop(inputPath, coords, outputPath) {
    const metadata = await sharp(inputPath).metadata();
    
    const top = Math.max(0, Math.round(coords.ymin));
    const left = Math.max(0, Math.round(coords.xmin));
    const width = Math.min(metadata.width - left, Math.round(coords.xmax - coords.xmin));
    const height = Math.min(metadata.height - top, Math.round(coords.ymax - coords.ymin));

    if (width <= 0 || height <= 0) {
        throw new Error(`Invalid crop dimensions: ${width}x${height}`);
    }

    await sharp(inputPath)
        .extract({ left, top, width, height })
        .toFile(outputPath);
}
