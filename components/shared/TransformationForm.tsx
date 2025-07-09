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
  FormField,
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
import { toast } from "sonner"

export const formSchema = z.object({
  title: z.string(),
  aspectRatio: z.string().optional(),
  color: z.string().optional(),
  prompt: z.string().optional(),
  publicId: z.string(),
  format: z.string().optional(),
  conversion: z.string().optional(),
})

const VideoPopup = ({ videoUrl, onClose }: { videoUrl: string; onClose: () => void }) => {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center">
      <div className="bg-white rounded-lg p-4 w-[800px] max-w-full relative">
        <button
          className="absolute top-2 right-2 text-gray-600 hover:text-black text-sm"
          onClick={() => {
            setIsVisible(false)
            onClose()
          }}
        >
          Skip
        </button>
        <video controls autoPlay className="w-full h-[450px] rounded">
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  )
}

const TransformationForm = ({
  action,
  data = null,
  userId,
  type,
  creditBalance,
  config = null,
}: TransformationFormProps) => {
  const transformationType = transformationTypes[type]
  const [image, setImage] = useState(data)
  const [newTransformation, setNewTransformation] = useState<Transformations | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)
  const [transformationConfig, setTransformationConfig] = useState(config)
  const [isPending, startTransition] = useTransition()
  const [convertedUrl, setConvertedUrl] = useState<string>("")
  const [isConverting, setIsConverting] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const router = useRouter()

  const initialValues = data && action === "Update"
    ? {
        title: data?.title,
        aspectRatio: data?.aspectRatio,
        color: data?.color,
        prompt: data?.prompt,
        publicId: data?.publicId,
        format: data?.format,
        conversion: data?.conversion,
      }
    : defaultValues

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
  })

  const videoUrls: Record<string, string> = {
    fill: "/assets/videos/Generative-fill.mp4",
    restore: "/assets/videos/restore-image.mp4",
    removeBackground: "/assets/videos/background-remove.mp4",
    remove: "/assets/videos/object-remove.mp4",
    recolor: "/assets/videos/object-recolor.mp4",
    imageconverter: "/assets/videos/snap-2-png.mp4",
  }

  useEffect(() => {
    const typesWithVideos = [
      "fill",
      "restore",
      "removeBackground",
      "remove",
      "recolor",
      "imageconverter",
    ]
    if (typesWithVideos.includes(type)) {
      setShowVideo(true)
    }
  }, [type])

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true)

    if (data || image) {
      const transformationUrl = getCldImageUrl({
        width: image?.width,
        height: image?.height,
        src: image?.publicId,
        ...transformationConfig,
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

      try {
        if (action === "Add") {
          const newImage = await addImage({
            image: imageData,
            userId,
            path: "/",
          })

          if (newImage) {
            form.reset()
            setImage(data)
            router.push(`/transformations/${newImage._id}`)
          }
        }

        if (action === "Update") {
          const updatedImage = await updateImage({
            image: {
              ...imageData,
              _id: data._id,
            },
            userId,
            path: `/transformations/${data._id}`,
          })

          if (updatedImage) {
            router.push(`/transformations/${updatedImage._id}`)
          }
        }
      } catch (error) {
        console.log(error)
      }
    }

    setIsSubmitting(false)
  }

  const onSelectFieldHandler = (
    value: string,
    onChangeField: (value: string) => void
  ) => {
    const imageSize = aspectRatioOptions[value as AspectRatioKey]
    if (imageSize) {
      setImage((prevState: any) => ({
        ...prevState,
        aspectRatio: imageSize.aspectRatio,
        width: imageSize.width,
        height: imageSize.height,
      }))
    }

    setNewTransformation(transformationType.config)
    return onChangeField(value)
  }

  const onInputChangeHandler = (
    fieldName: string,
    value: string,
    type: string,
    onChangeField: (value: string) => void
  ) => {
    debounce(() => {
      setNewTransformation((prevState: any) => ({
        ...prevState,
        [type]: {
          ...prevState?.[type],
          [fieldName === "prompt" ? "prompt" : "to"]: value,
        },
      }))
    }, 1000)()
    return onChangeField(value)
  }

  const handleFormatChange = async (
    value: string,
    onChangeField: (value: string) => void
  ) => {
    if (type === "imageconverter") {
      setNewTransformation(transformationType.config)
    }

    onSelectFieldHandler("png", onChangeField)
    setConvertedUrl("")
  }

  const onTransformHandler = async () => {
    setIsTransforming(true)

    setTransformationConfig(
      deepMergeObjects(newTransformation, transformationConfig)
    )

    setNewTransformation(null)

    startTransition(async () => {
      if (type !== "restore" && type !== "imageconverter") {
        await updateCredits(userId, creditFee)
        toast.success("Image uploaded successfully\n1 credit was deducted from your account")
      }
    })
  }

  useEffect(() => {
    if (image && (type === "restore" || type === "removeBackground")) {
      setNewTransformation(transformationType.config)
    }
  }, [image, transformationType.config, type])

  useEffect(() => {
    if (type === "imageconverter") {
      form.setValue("format", "png")
      setNewTransformation(transformationType.config)
    }
  }, [image, type, transformationType.config, form])

  return (
    <>
      {showVideo && videoUrls[type] && (
        <VideoPopup videoUrl={videoUrls[type]} onClose={() => setShowVideo(false)} />
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {creditBalance < Math.abs(creditFee) &&
            type !== "restore" &&
            type !== "imageconverter" && <InsufficientCreditsModal />}

          <CustomField
            control={form.control}
            name="title"
            formLabel="Image Title"
            className="w-full"
            render={({ field }) => <Input {...field} className="input-field" />}
          />

          {type === "fill" && (
            <CustomField
              control={form.control}
              name="aspectRatio"
              formLabel="Aspect Ratio"
              className="w-full"
              render={({ field }) => (
                <Select
                  onValueChange={(value) =>
                    onSelectFieldHandler(value, field.onChange)
                  }
                  value={field.value}
                >
                  <SelectTrigger className="select-field">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(aspectRatioOptions).map((key) => (
                      <SelectItem
                        key={key}
                        value={key}
                        className="select-item"
                      >
                        {aspectRatioOptions[key as AspectRatioKey].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}

          {type === "imageconverter" && (
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
                <span className="ml-2 text-xs text-gray-400">
                  (Output will be PNG)
                </span>
              </div>
            </>
          )}

          {(type === "remove" || type === "recolor") && (
            <div className="prompt-field">
              <CustomField
                control={form.control}
                name="prompt"
                formLabel={
                  type === "remove" ? "Object to remove" : "Object to recolor"
                }
                className="w-full"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    className="input-field"
                    onChange={(e) =>
                      onInputChangeHandler(
                        "prompt",
                        e.target.value,
                        type,
                        field.onChange
                      )
                    }
                  />
                )}
              />

              {type === "recolor" && (
                <CustomField
                  control={form.control}
                  name="color"
                  formLabel="Replacement Color"
                  className="w-full"
                  render={({ field }) => (
                    <Input
                      value={field.value}
                      className="input-field"
                      onChange={(e) =>
                        onInputChangeHandler(
                          "color",
                          e.target.value,
                          "recolor",
                          field.onChange
                        )
                      }
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
                  setImage={(img) => setImage(img)}
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
              {isTransforming ? "Transforming..." : "Apply Transformation"}
            </Button>

            {!isTransforming && transformationConfig && (
              <Button
                type="submit"
                className="submit-button capitalize"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Share With Community"}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </>
  )
}

export default TransformationForm
