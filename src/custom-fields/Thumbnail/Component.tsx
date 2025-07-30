'use client'
import Image from 'next/image'
import React, { useState, useEffect } from 'react'
import { DefaultCellComponentProps } from 'payload'
import { Media } from '@/payload-types'

const getImage = (imageId: string) => {
  return fetch(
    `/api/media/${imageId}`
  )
}

export default function Thumbnail(props: DefaultCellComponentProps) {
  const { cellData } = props
  const [image, setImage] = useState<Media | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    const fetchImage = async () => {
      if (cellData) {
        try {
          setLoading(true);
          const response = await getImage(cellData)
          const media: Media = await response.json()
          if (media && media.url) {
            setImage(media)
          }
          setLoading(false)
        } catch (error) {
          setLoading(false)
        }
      }
    }

    fetchImage()
  }, [cellData])

  if (loading) {
    return (
      <div className="relationship-cell">Loading...</div>
    )
  }

  if (!cellData || !image) {
    return (
      <div>&lt;No {String("label")}&gt;</div>
    )
  }

  return (
    <div
      className="prod-thumb"
      style={{
        backgroundColor: cellData as string,
        display: "flex",
        position: "relative",
        width: "40px",
        height: "40px",
      }}
      >
      <Image
        src={image.url as string}
        alt={image.alt}
        fill={true}
        style={{
          objectFit: 'cover',
        }}
      />
    </div>
  )
}
