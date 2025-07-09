import { auth } from "@clerk/nextjs";
import Image from "next/image";
import { redirect } from "next/navigation";

import { Collection } from "@/components/shared/Collection";
import Header from "@/components/shared/Header";
import { getUserImages } from "@/lib/actions/image.actions";
import { getUserById } from "@/lib/actions/user.actions";

interface ImageItem {
  transformationType: string;
  [key: string]: any;
}

const Profile = async ({ searchParams }: SearchParamProps) => {
  const page = Number(searchParams?.page) || 1;
  const { userId } = auth();

  if (!userId) redirect("/sign-in");

  const user = await getUserById(userId);
  const images = await getUserImages({ page, userId: user._id });

  const allImages = images?.data || [];

  // ❌ Exclude "restore" and "imageconverter" from reward progress
  const excludedTypes = ["restore", "imageconverter"];
  const eligibleImages = allImages.filter((img: ImageItem) => {
    const type = img.transformationType?.toLowerCase();
    return !excludedTypes.includes(type);
  });

  const totalImages = allImages.length;
  const rewardProgress = eligibleImages.length % 2;

  return (
    <>
      <Header title="Profile" />

      <section className="profile">
        {/* CREDITS BLOCK */}
        <div className="profile-balance">
          <p className="p-14-medium md:p-16-medium">CREDITS AVAILABLE</p>
          <div className="mt-4 flex items-center gap-4">
            <Image
              src="/assets/icons/coins.svg"
              alt="coins"
              width={50}
              height={50}
              className="size-9 md:size-12"
            />
            <h2 className="h2-bold text-dark-600">{user.creditBalance}</h2>
          </div>

          {/* ✅ REWARD PROGRESS SECTION */}
          <div className="mt-6">
            <p className="p-14-medium md:p-16-medium text-primary">REWARD</p>
            <p className="text-sm text-gray-500 mt-1">
              Share 2 images and get <span className="font-semibold">1 free credit</span>
            </p>
            <div className="mt-2 flex gap-2">
              {[...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className={`h-3 w-3 rounded-full ${
                    i < rewardProgress ? "bg-yellow-400" : "bg-gray-300"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* IMAGE MANIPULATION BLOCK */}
        <div className="profile-image-manipulation">
          <p className="p-14-medium md:p-16-medium">IMAGE MANIPULATION DONE</p>
          <div className="mt-4 flex items-center gap-4">
            <Image
              src="/assets/icons/photo.svg"
              alt="photo"
              width={50}
              height={50}
              className="size-9 md:size-12"
            />
            <h2 className="h2-bold text-dark-600">{totalImages}</h2>
          </div>
        </div>
      </section>

      <section className="mt-8 md:mt-14">
        <Collection
          images={images?.data}
          totalPages={images?.totalPages}
          page={page}
        />
      </section>
    </>
  );
};

export default Profile;
