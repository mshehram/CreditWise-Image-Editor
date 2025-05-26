"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { aspectRatioOptions, creditFee, defaultValues, transformationTypes } from "@/constants"
import { CustomField } from "./CustomField"
import { useEffect, useState, useTransition } from "react"
import { AspectRatioKey, debounce, deepMergeObjects } from "@/lib/utils"
import MediaUploader from "./MediaUploader"
import TransformedImage from "./TransformedImage"
import { updateCredits } from "@/lib/actions/user.actions"
import { getCldImageUrl } from "next-cloudinary"
import { addImage, updateImage } from "@/lib/actions/image.actions"
import { useRouter } from "next/navigation"
import { InsufficientCreditsModal } from "./InsufficientCreditsModal"

export const formSchema = z.object({
  title: z.string(),
  aspectRatio: z.string().optional(),
  color: z.string().optional(),
  prompt: z.string().optional(),
  publicId: z.string(),
  format: z.string().optional(),
  conversion: z.string().optional(),
})

const TransformationForm = ({ action, data = null, userId, type, creditBalance, config = null }: TransformationFormProps) => {
  const transformationType = transformationTypes[type];
  const [image, setImage] = useState(data)
  const [newTransformation, setNewTransformation] = useState<Transformations | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformationConfig, setTransformationConfig] = useState(config)
  const [isPending, startTransition] = useTransition()
  const [convertedUrl, setConvertedUrl] = useState<string>("")
  const [isConverting, setIsConverting] = useState(false)
  const router = useRouter()

  const initialValues = data && action === 'Update' ? {
    title: data?.title,
    aspectRatio: data?.aspectRatio,
    color: data?.color,
    prompt: data?.prompt,
    publicId: data?.publicId,
    format: data?.format,
    conversion: data?.conversion,
  } : defaultValues

  // 1. Define your form.
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
  })

  // 2. Define a submit handler.
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);

    if (data || image) {
      const transformationUrl = getCldImageUrl({
        width: image?.width,
        height: image?.height,
        src: image?.publicId,
        ...transformationConfig
      })

      const imageData = {
        title: values.title,
        publicId: image?.publicId,
        transformationType: type,
        width: image?.width,
        height: image?.height,
        config: transformationConfig,
        secureURL: image?.secureURL,
        transformationURL: transformationUrl,
        aspectRatio: values.aspectRatio,
        prompt: values.prompt,
        color: values.color,
      }

      if (action === 'Add') {
        try {
          const newImage = await addImage({
            image: imageData,
            userId,
            path: '/'
          })

          if (newImage) {
            form.reset()
            setImage(data)
            router.push(`/transformations/${newImage._id}`)
          }
        } catch (error) {
          console.log(error);
        }
      }

      if (action === 'Update') {
        try {
          const updatedImage = await updateImage({
            image: {
              ...imageData,
              _id: data._id
            },
            userId,
            path: `/transformations/${data._id}`
          })

          if (updatedImage) {
            router.push(`/transformations/${updatedImage._id}`)
          }
        } catch (error) {
          console.log(error);
        }
      }
    }

    setIsSubmitting(false)
  }

  // Only update aspect ratio if value is a valid aspect ratio key
  const onSelectFieldHandler = (value: string, onChangeField: (value: string) => void) => {
    const imageSize = aspectRatioOptions[value as AspectRatioKey];
    if (imageSize) {
      setImage((prevState: any) => ({
        ...prevState,
        aspectRatio: imageSize.aspectRatio,
        width: imageSize.width,
        height: imageSize.height,
      }));
    }
    setNewTransformation(transformationType.config);
    return onChangeField(value);
  };

  const onInputChangeHandler = (fieldName: string, value: string, type: string, onChangeField: (value: string) => void) => {
    debounce(() => {
      setNewTransformation((prevState: any) => ({
        ...prevState,
        [type]: {
          ...prevState?.[type],
          [fieldName === 'prompt' ? 'prompt' : 'to']: value
        }
      }))
    }, 1000)();

    return onChangeField(value)
  }

  // For imageconverter: just set the default config, do not add format to newTransformation
  const handleFormatChange = async (value: string, onChangeField: (value: string) => void) => {
    if (type === 'imageconverter') {
      setNewTransformation(transformationType.config);
    }
    onSelectFieldHandler('png', onChangeField);
    setConvertedUrl("");
  }

  const onTransformHandler = async () => {
    setIsTransforming(true)

    setTransformationConfig(
      deepMergeObjects(newTransformation, transformationConfig)
    )

    setNewTransformation(null)

    startTransition(async () => {
      await updateCredits(userId, creditFee)
    })
  }

  useEffect(() => {
    if (image && (type === 'restore' || type === 'removeBackground')) {
      setNewTransformation(transformationType.config)
    }
  }, [image, transformationType.config, type])

  // For imageconverter: always set format to png and set newTransformation to config only
  useEffect(() => {
    if (type === 'imageconverter') {
      form.setValue('format', 'png');
      setNewTransformation(transformationType.config);
    }
    // eslint-disable-next-line
  }, [image, type, transformationType.config]);

  // Debug logs for rendering
  useEffect(() => {
    console.log("image:", image);
    if (image) {
      console.log("image.type:", image.type);
    }
  }, [image]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {creditBalance < Math.abs(creditFee) && <InsufficientCreditsModal />}
        <CustomField
          control={form.control}
          name="title"
          formLabel="Image Title"
          className="w-full"
          render={({ field }) => <Input {...field} className="input-field" />}
        />

        {type === 'fill' && (
          <CustomField
            control={form.control}
            name="aspectRatio"
            formLabel="Aspect Ratio"
            className="w-full"
            render={({ field }) => (
              <Select
                onValueChange={(value) => onSelectFieldHandler(value, field.onChange)}
                value={field.value}
              >
                <SelectTrigger className="select-field">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(aspectRatioOptions).map((key) => (
                    <SelectItem key={key} value={key} className="select-item">
                      {aspectRatioOptions[key as AspectRatioKey].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}

        {/* Hide format selection for imageconverter, always use PNG */}
        {type === 'imageconverter' && (
          <>
            <input type="hidden" {...form.register("format")} value="png" />
            <div className="mb-2 text-sm text-gray-500">
              <span>Supported formats: </span>
              <span className="inline-flex gap-2">
                <span className="px-2 py-0.5 bg-gray-200 rounded">WebP</span>
                <span className="px-2 py-0.5 bg-gray-200 rounded">GIF</span>
                <span className="px-2 py-0.5 bg-gray-200 rounded">TIFF</span>
                <span className="px-2 py-0.5 bg-gray-200 rounded">JPEG</span>
                <span className="px-2 py-0.5 bg-gray-200 rounded">JPG</span>
              </span>
              <span className="ml-2 text-xs text-gray-400">(Output will be PNG)</span>
            </div>
          </>
        )}

        {convertedUrl && (
          <div className="mt-2">
            <a href={convertedUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Download Converted Image
            </a>
          </div>
        )}
        {isConverting && (
          <div className="mt-2 text-gray-500">Converting...</div>
        )}

        {type === 'transformingdimensions' && (
          <CustomField
            control={form.control}
            name="conversion"
            className="w-full"
            render={({ field }) => (
              <Select
                onValueChange={(value) => onSelectFieldHandler(value, field.onChange)}
                value={field.value}
              >
                {/* Add SelectTrigger and SelectContent as needed */}
              </Select>
            )}
          />)}

        {(type === 'remove' || type === 'recolor') && (
          <div className="prompt-field">
            <CustomField
              control={form.control}
              name="prompt"
              formLabel={
                type === 'remove' ? 'Object to remove' : 'Object to recolor'
              }
              className="w-full"
              render={({ field }) => (
                <Input
                  value={field.value}
                  className="input-field"
                  onChange={(e) => onInputChangeHandler(
                    'prompt',
                    e.target.value,
                    type,
                    field.onChange
                  )}
                />
              )}
            />

            {type === 'recolor' && (
              <CustomField
                control={form.control}
                name="color"
                formLabel="Replacement Color"
                className="w-full"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    className="input-field"
                    onChange={(e) => onInputChangeHandler(
                      'color',
                      e.target.value,
                      'recolor',
                      field.onChange
                    )}
                  />
                )}
              />
            )}
          </div>
        )}

        <div className="media-uploader-field">
          <CustomField
            control={form.control}
            name="publicId"
            className="flex size-full flex-col"
            render={({ field }) => (
              <MediaUploader
                onValueChange={field.onChange}
                setImage={(img) => {
                  console.log("MediaUploader setImage called, img:", img);
                  setImage(img);
                }}
                publicId={field.value}
                image={image}
                type={type}
              />
            )}
          />

          <TransformedImage
            image={image}
            type={type}
            title={form.getValues().title}
            isTransforming={isTransforming}
            setIsTransforming={setIsTransforming}
            transformationConfig={transformationConfig}
          />
        </div>

        <div className="flex flex-col gap-4 Action-Buttons">
          <Button
            type="button"
            className="submit-button capitalize w-12"
            disabled={isTransforming || newTransformation === null}
            onClick={onTransformHandler}
          >
            {isTransforming ? 'Transforming...' : 'Apply Transformation'}
          </Button>
          {!isTransforming && transformationConfig && (
            <Button
              type="submit"
              className="submit-button capitalize"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Share With Community'}
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}

export default TransformationForm